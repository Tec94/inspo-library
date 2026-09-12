use reqwest::{header, Response};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::{HashMap, HashSet}, fs, future::Future, io::Write, net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr}, path::{Path, PathBuf}, sync::Mutex, time::Duration};
use tokio::sync::watch;
use url::{Host, Url};

#[derive(Default)]
pub struct Requests(Mutex<HashMap<String, watch::Sender<bool>>>);

struct RequestGuard<'a> { requests: &'a Requests, id: String }
impl Drop for RequestGuard<'_> {
    fn drop(&mut self) { if let Ok(mut requests) = self.requests.0.lock() { requests.remove(&self.id); } }
}

impl Requests {
    pub fn cancel(&self, id: &str) {
        if let Ok(requests) = self.0.lock() { if let Some(cancel) = requests.get(id) { let _ = cancel.send(true); } }
    }
    pub async fn run<T>(&self, id: String, timeout: Option<f64>, work: impl Future<Output = Result<T, String>>) -> Result<T, String> {
        let duration = timeout.map(|seconds| {
            if seconds <= 0.0 { return Err("The request timeout must be positive.".to_string()); }
            Duration::try_from_secs_f64(seconds).map_err(|_| "The request timeout is outside the supported duration range.".to_string())
        }).transpose()?;
        if id.is_empty() { return Err("The source request identifier is missing.".into()); }
        let (sender, mut receiver) = watch::channel(false);
        {
            let mut requests = self.0.lock().map_err(|_| "The source request could not start.")?;
            if requests.contains_key(&id) { return Err("This source request is already running.".into()); }
            requests.insert(id.clone(), sender);
        }
        let _guard = RequestGuard { requests: self, id };
        let cancelled = async { while !*receiver.borrow_and_update() { if receiver.changed().await.is_err() { break; } } };
        let expires = duration.map(|value| tokio::time::Instant::now().checked_add(value).ok_or("The request timeout is outside the supported duration range.")).transpose()?;
        let deadline = async { match expires { Some(value) => tokio::time::sleep_until(value).await, None => std::future::pending::<()>().await } };
        tokio::select! {
            biased;
            _ = cancelled => Err("Source capture cancelled.".into()),
            _ = deadline => Err("The source exceeded your request timeout.".into()),
            result = work => result,
        }
    }
}

fn v4_prefix(ip: Ipv4Addr, network: [u8; 4], bits: u32) -> bool { u32::from(ip) >> (32 - bits) == u32::from(Ipv4Addr::from(network)) >> (32 - bits) }
fn v6_prefix(ip: Ipv6Addr, network: Ipv6Addr, bits: u32) -> bool { u128::from(ip) >> (128 - bits) == u128::from(network) >> (128 - bits) }

pub fn public_address(ip: IpAddr) -> bool {
    // Prefixes and exceptions come from IANA's IPv4/IPv6 special-purpose registries.
    // https://www.iana.org/assignments/iana-ipv4-special-registry/
    // https://www.iana.org/assignments/iana-ipv6-special-registry/
    match ip {
        IpAddr::V4(ip) => {
            if ip == Ipv4Addr::new(192, 0, 0, 9) || ip == Ipv4Addr::new(192, 0, 0, 10) { return true; }
            ![
                ([0,0,0,0],8), ([10,0,0,0],8), ([100,64,0,0],10), ([127,0,0,0],8),
                ([169,254,0,0],16), ([172,16,0,0],12), ([192,0,0,0],24), ([192,0,2,0],24),
                ([192,88,99,0],24), ([192,168,0,0],16), ([198,18,0,0],15), ([198,51,100,0],24),
                ([203,0,113,0],24), ([224,0,0,0],4), ([240,0,0,0],4),
            ].iter().any(|(network, bits)| v4_prefix(ip, *network, *bits))
        },
        IpAddr::V6(ip) => {
            // Direct public web connections use global unicast; mapped/NAT64/6to4 addresses can conceal private IPv4 destinations.
            if !v6_prefix(ip, Ipv6Addr::new(0x2000,0,0,0,0,0,0,0), 3) { return false; }
            if [1,2,3].iter().any(|last| ip == Ipv6Addr::new(0x2001,1,0,0,0,0,0,*last)) { return true; }
            if [(Ipv6Addr::new(0x2001,3,0,0,0,0,0,0),32), (Ipv6Addr::new(0x2001,4,0x112,0,0,0,0,0),48), (Ipv6Addr::new(0x2001,0x20,0,0,0,0,0,0),28), (Ipv6Addr::new(0x2001,0x30,0,0,0,0,0,0),28)].iter().any(|(network, bits)| v6_prefix(ip, *network, *bits)) { return true; }
            ![(Ipv6Addr::new(0x2001,0,0,0,0,0,0,0),23), (Ipv6Addr::new(0x2001,0xdb8,0,0,0,0,0,0),32), (Ipv6Addr::new(0x2002,0,0,0,0,0,0,0),16), (Ipv6Addr::new(0x3fff,0,0,0,0,0,0,0),20)].iter().any(|(network, bits)| v6_prefix(ip, *network, *bits))
        },
    }
}

pub fn source_url(input: &str) -> Result<Url, String> {
    let mut url = super::web_url(input)?;
    url.set_fragment(None);
    match url.host() {
        Some(Host::Ipv4(ip)) if !public_address(IpAddr::V4(ip)) => Err("Local and private network sources are not allowed.".into()),
        Some(Host::Ipv6(ip)) if !public_address(IpAddr::V6(ip)) => Err("Local and private network sources are not allowed.".into()),
        None => Err("The source URL has no host.".into()),
        _ => Ok(url),
    }
}

async fn public_addresses(url: &Url) -> Result<(String, Vec<SocketAddr>), String> {
    let port = url.port_or_known_default().ok_or("The source URL has no supported port.")?;
    let (host, addresses) = match url.host().ok_or("The source URL has no host.")? {
        Host::Ipv4(ip) => (ip.to_string(), vec![SocketAddr::new(ip.into(), port)]),
        Host::Ipv6(ip) => (ip.to_string(), vec![SocketAddr::new(ip.into(), port)]),
        Host::Domain(host) => (host.to_string(), tokio::net::lookup_host((host, port)).await.map_err(|_| "The source hostname could not be resolved.")?.collect()),
    };
    if addresses.is_empty() || addresses.iter().any(|address| !public_address(address.ip())) { return Err("Local and private network sources are not allowed.".into()); }
    Ok((host, addresses))
}

async fn response(input: &str) -> Result<Response, String> {
    let mut url = source_url(input)?;
    let mut visited = HashSet::new();
    loop {
        if !visited.insert(url.to_string()) { return Err("The source redirects in a loop.".into()); }
        let (host, addresses) = public_addresses(&url).await?;
        let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
            .resolve_to_addrs(&host, &addresses).build().map_err(|_| "Unable to start the source connection.")?;
        let response = client.get(url.clone()).header(header::USER_AGENT, "InspoLibrary/0.2").header(header::ACCEPT, "*/*").header(header::ACCEPT_ENCODING, "identity")
            .send().await.map_err(|_| "Unable to reach the source. Check the URL and network connection.")?;
        if [301,302,303,307,308].contains(&response.status().as_u16()) {
            let location = response.headers().get(header::LOCATION).and_then(|value| value.to_str().ok()).ok_or("The source returned a redirect without a destination.")?;
            url = source_url(url.join(location).map_err(|_| "The source redirect is invalid.")?.as_str())?;
            continue;
        }
        if !response.status().is_success() { return Err(format!("The source returned HTTP {}.", response.status().as_u16())); }
        if response.headers().get(header::CONTENT_ENCODING).and_then(|value| value.to_str().ok()).is_some_and(|value| value != "identity") { return Err("The source ignored the uncompressed transfer request. Its media was not saved.".into()); }
        return Ok(response);
    }
}

#[derive(Serialize)]
pub struct Document { url: String, mime: String, text: String }
pub async fn document(url: &str) -> Result<Document, String> {
    let response = response(url).await?;
    let url = response.url().to_string();
    let mime = response.headers().get(header::CONTENT_TYPE).and_then(|value| value.to_str().ok()).unwrap_or("application/octet-stream").split(';').next().unwrap_or_default().trim().to_ascii_lowercase();
    let text = if mime.starts_with("text/") || mime == "application/xhtml+xml" || mime == "application/json" || mime.ends_with("+json") {
        response.text().await.map_err(|_| "The source document was interrupted.")?
    } else { String::new() };
    Ok(Document { url, mime, text })
}

// WHATWG MIME Sniffing signatures and ISO BMFF's fixed major/minor brand header use 16 bytes.
// This prefix identifies a file; it does not impose a download size limit.
const SIGNATURE_BYTES: usize = 16;
fn media_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[137,80,78,71,13,10,26,10]) { return Some("image/png"); }
    if bytes.starts_with(&[255,216,255]) { return Some("image/jpeg"); }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") { return Some("image/gif"); }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") { return Some("image/webp"); }
    if bytes.starts_with(b"BM") { return Some("image/bmp"); }
    if bytes.starts_with(&[0,0,1,0]) { return Some("image/x-icon"); }
    if bytes.starts_with(&[26,69,223,163]) { return Some("video/webm"); }
    if bytes.len() >= SIGNATURE_BYTES && bytes.get(4..8) == Some(b"ftyp") && u32::from_be_bytes([bytes[0],bytes[1],bytes[2],bytes[3]]) >= 16 {
        let brand = &bytes[8..12];
        if [b"avif", b"avis"].iter().any(|candidate| brand == *candidate) { return Some("image/avif"); }
        if [b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1"].iter().any(|candidate| brand == *candidate) { return Some("image/heic"); }
        if brand == b"qt  " { return Some("video/quicktime"); }
        if [b"isom",b"mp41",b"mp42",b"avc1",b"M4V ",b"MSNV",b"dash"].iter().any(|candidate| brand == *candidate) || (brand.starts_with(b"iso") && (b'2'..=b'9').contains(&brand[3])) || (brand.starts_with(b"3gp") && (b'4'..=b'9').contains(&brand[3])) { return Some("video/mp4"); }
    }
    None
}

struct Download { path: PathBuf, file: Option<fs::File>, digest: Sha256, prefix: Vec<u8>, length: u64, maximum: Option<f64> }
impl Drop for Download {
    fn drop(&mut self) { self.file.take(); let _ = fs::remove_file(&self.path); }
}
impl Download {
    fn create(root: &Path, max_mb: Option<f64>) -> Result<Self, String> {
        if max_mb.is_some_and(|value| !value.is_finite() || value <= 0.0) { return Err("The download size setting must be positive.".into()); }
        let path = root.join("objects").join(format!("{}.tmp", uuid::Uuid::new_v4()));
        let file = fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|_| "Unable to store the media. Check available disk space.")?;
        Ok(Self { path, file: Some(file), digest: Sha256::new(), prefix: Vec::new(), length: 0, maximum: max_mb.map(|value| value * 1_000_000.0) })
    }
    fn write(&mut self, chunk: &[u8]) -> Result<(), String> {
        self.length = self.length.checked_add(chunk.len() as u64).ok_or("The media exceeds the file-size range supported by this device.")?;
        if self.maximum.is_some_and(|maximum| self.length as f64 > maximum) { return Err("The media exceeds your download size setting.".into()); }
        let needed = SIGNATURE_BYTES.saturating_sub(self.prefix.len());
        self.prefix.extend_from_slice(&chunk[..needed.min(chunk.len())]);
        if self.prefix.len() == SIGNATURE_BYTES && media_mime(&self.prefix).is_none() { return Err("The source did not return a supported image or video. Its response was not saved.".into()); }
        self.digest.update(chunk);
        self.file.as_mut().ok_or("The media download is already closed.")?.write_all(chunk).map_err(|_| "Unable to store the media. Check available disk space.".to_string())
    }
    fn finish(mut self, root: &Path) -> Result<Asset, String> {
        if self.prefix.len() < SIGNATURE_BYTES { return Err("The source returned an empty or incomplete media file.".into()); }
        let mime = media_mime(&self.prefix).ok_or("The source did not return a supported image or video.")?.to_string();
        let asset = format!("{:x}", self.digest.clone().finalize());
        self.file.as_mut().ok_or("The media download is already closed.")?.sync_all().map_err(|_| "The media save did not complete. Check available disk space.")?;
        self.file.take();
        let destination = super::asset_path(root, &asset)?;
        if !destination.is_file() {
            if fs::rename(&self.path, &destination).is_err() && !destination.is_file() { return Err("The media could not be saved. Check available disk space.".into()); }
        }
        Ok(Asset { asset, mime })
    }
}

#[derive(Debug, Serialize)]
pub struct Asset { pub asset: String, pub mime: String }
async fn store_response(mut response: Response, root: &Path, max_mb: Option<f64>) -> Result<Asset, String> {
    if let (Some(size), Some(maximum)) = (response.content_length(), max_mb) { if size as f64 > maximum * 1_000_000.0 { return Err("The media exceeds your download size setting.".into()); } }
    let mut download = Download::create(root, max_mb)?;
    while let Some(chunk) = response.chunk().await.map_err(|_| "The media transfer was interrupted. The incomplete file was removed.")? { download.write(&chunk)?; }
    download.finish(root)
}
pub async fn asset(url: &str, root: &Path, max_mb: Option<f64>) -> Result<Asset, String> {
    if max_mb.is_some_and(|value| !value.is_finite() || value <= 0.0) { return Err("The download size setting must be positive.".into()); }
    store_response(response(url).await?, root, max_mb).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    fn directory() -> PathBuf { let path = std::env::temp_dir().join(format!("inspo-remote-test-{}", uuid::Uuid::new_v4())); fs::create_dir_all(path.join("objects")).unwrap(); path }
    #[test]
    fn public_network_boundary_covers_literal_and_translated_addresses() {
        for ip in ["0.1.2.3", "10.0.0.1", "100.100.100.200", "127.0.0.1", "169.254.169.254", "172.16.1.1", "192.168.1.1", "198.18.0.1", "203.0.113.1", "224.0.0.1", "::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "fc00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::", "3fff::1"] { assert!(!public_address(ip.parse().unwrap()), "{ip}"); }
        for ip in ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111", "2001:4860:4860::8888"] { assert!(public_address(ip.parse().unwrap()), "{ip}"); }
        for url in ["http://2130706433/", "http://0x7f000001/", "https://user:secret@example.com/", "file:///etc/passwd", "http://[::ffff:127.0.0.1]/"] { assert!(source_url(url).is_err(), "{url}"); }
    }
    #[test]
    fn downloads_keep_bytes_and_hash_across_chunks_and_discard_failed_files() {
        let root = directory();
        let bytes = [b"\x89PNG\r\n\x1a\n".as_slice(), b"a source image body split across chunks"].concat();
        let mut download = Download::create(&root, None).unwrap();
        for chunk in bytes.chunks(3) { download.write(chunk).unwrap(); }
        let saved = download.finish(&root).unwrap();
        assert_eq!(saved.asset, super::super::hash(&bytes));
        assert_eq!(saved.mime, "image/png");
        assert_eq!(fs::read(root.join("objects").join(saved.asset)).unwrap(), bytes);
        { let mut download = Download::create(&root, Some(1.0 / 1_000_000.0)).unwrap(); assert!(download.write(&bytes).is_err()); }
        { let mut download = Download::create(&root, None).unwrap(); assert!(download.write(b"<!doctype html><title>Not media</title>").is_err()); }
        assert_eq!(fs::read_dir(root.join("objects")).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn local_http_fixture_proves_streamed_storage_without_relaxing_public_fetch_policy() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let bytes = b"GIF89a0123456789abcdefghijklmnop";
        let fixture = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = [0; 1];
            let mut header = Vec::new();
            while !header.ends_with(b"\r\n\r\n") { socket.read_exact(&mut request).unwrap(); header.push(request[0]); }
            write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", bytes.len()).unwrap();
            for chunk in bytes.chunks(3) { socket.write_all(chunk).unwrap(); }
        });
        let root = directory();
        let response = reqwest::Client::builder().no_proxy().build().unwrap().get(format!("http://{address}/")).send().await.unwrap();
        let saved = store_response(response, &root, None).await.unwrap();
        assert_eq!(saved.mime, "image/gif");
        assert_eq!(fs::read(root.join("objects").join(saved.asset)).unwrap(), bytes);
        fixture.join().unwrap(); fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    async fn cancellation_stops_only_the_named_request_and_cleans_registration() {
        let requests = Requests::default();
        let root = directory();
        let downloading = async {
            let mut download = Download::create(&root, None)?;
            download.write(b"GIF89a0123456789incomplete")?;
            std::future::pending::<()>().await;
            download.finish(&root)
        };
        let work = requests.run("first".into(), None, downloading);
        let cancel = async { tokio::task::yield_now().await; requests.cancel("unrelated"); assert!(requests.0.lock().unwrap().contains_key("first")); requests.cancel("first"); };
        let (result, _) = tokio::join!(work, cancel);
        assert!(result.unwrap_err().contains("cancelled"));
        assert!(requests.0.lock().unwrap().is_empty());
        assert_eq!(fs::read_dir(root.join("objects")).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }
}
