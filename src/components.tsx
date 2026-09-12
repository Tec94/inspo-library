import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  X,
  Image as ImageIcon,
  FileText,
  Link,
  Play,
  File,
  LoaderCircle,
  ExternalLink,
} from "lucide-react";
import { assetUrl, openExternal } from "./storage";
import type { Item } from "./model";
import { embedUrl } from "./importing";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  children: ReactNode;
  primary?: boolean;
  quiet?: boolean;
}
export function Button({
  label,
  children,
  primary,
  quiet,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`button ${primary ? "primary" : ""} ${quiet ? "quiet" : ""} ${label ? "icon-button" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  description?: string;
}
export function Dialog({
  title,
  children,
  onClose,
  className = "",
  description,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!ref.current?.open) trigger.current = document.activeElement;
    ref.current?.showModal();
    return () => {
      queueMicrotask(() => {
        const element = trigger.current;
        if (element instanceof HTMLElement && element.isConnected)
          element.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-body">
        <header className="dialog-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <Button label="Close dialog" quiet onClick={onClose}>
            <X />
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export interface MediaProps {
  item: Item;
  controls?: boolean;
  className?: string;
  onTime?: (time: number) => void;
  onText?: (text: string) => void;
  allowEmbeds?: boolean;
  preferEmbed?: boolean;
}
export function Media({
  item,
  controls = false,
  className = "",
  onTime,
  onText,
  allowEmbeds = false,
  preferEmbed = false,
}: MediaProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setUrl("");
    setError("");
    if (item.asset)
      assetUrl(item.asset, item.mime)
        .then((value) => {
          if (active) setUrl(value);
        })
        .catch(() => {
          if (active) setError("Local file unavailable");
        });
    return () => {
      active = false;
    };
  }, [item.asset, item.mime]);
  if (controls && allowEmbeds && item.embed && item.review?.status !== "pending" && (!item.asset || preferEmbed || error)) {
    const source = embedUrl(item.embed);
    if (source) return <iframe className={`embed-viewer ${className}`} title={`Embedded ${item.embed.provider} source: ${item.title}`} src={source} sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allow="fullscreen; picture-in-picture; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />;
  }
  if (error)
    return (
      <div className={`media-fallback ${className}`}>
        <File />
        <span>{error}</span>
        <small>Re-import the original file.</small>
      </div>
    );
  if (item.kind === "image" && url)
    return (
      <img
        className={`reference-image ${className}`}
        src={url}
        alt={item.title}
        draggable={false}
        loading={controls ? "eager" : "lazy"}
      />
    );
  if (item.kind === "video" && url)
    return (
      <div className={`video-wrap ${className}`}>
        <video
          src={url}
          controls={controls}
          preload="metadata"
          playsInline
          onTimeUpdate={(e) => onTime?.(e.currentTarget.currentTime)}
        />
        {!controls && (
          <span className="video-badge">
            <Play size={12} fill="currentColor" /> Video
          </span>
        )}
      </div>
    );
  if (item.kind === "pdf" && url && controls)
    return (
      <iframe
        title={item.title}
        className={`pdf-viewer ${className}`}
        src={url}
        sandbox="allow-same-origin"
      />
    );
  if (item.asset && !url)
    return (
      <div className={`media-fallback ${className}`}>
        <LoaderCircle className="spinner" />
        <span>Opening local file…</span>
      </div>
    );
  if (item.kind === "note")
    return (
      <div
        className={`note-preview ${className}`}
        onMouseUp={() => onText?.(window.getSelection()?.toString() || "")}
      >
        <span className="eyebrow">A thought worth keeping</span>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
      </div>
    );
  const Icon =
    item.kind === "link"
      ? Link
      : item.kind === "pdf"
        ? FileText
        : item.kind === "file"
          ? File
          : ImageIcon;
  return (
    <div className={`media-fallback reference-only ${className}`}>
      <Icon size={32} />
      <h3>{item.title}</h3>
      {item.url && <span>{new URL(item.url).hostname}</span>}
      <small>
        {item.kind === "link"
          ? item.review?.status === "pending" ? "Waiting for your review" : item.capture?.status === "fetching" ? "Fetching source and media…" : item.capture?.status === "queued" ? "Waiting to import…" : "Source link saved"
          : item.kind.toUpperCase()}
      </small>
      {controls && item.url && (
        <Button
          onClick={() => {
            void openExternal(item.url).catch(() =>
              setError("Unable to open the original link"),
            );
          }}
        >
          Open original <ExternalLink size={14} />
        </Button>
      )}
      {controls && url && (
        <a className="button" href={url} download={item.title}>
          Download file
        </a>
      )}
    </div>
  );
}
export interface EmptyProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}
export function Empty({ title, children, action }: EmptyProps) {
  return (
    <div className="empty-state">
      <div className="empty-mark">
        <ImageIcon size={28} strokeWidth={1.25} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function errorMessage(error: Error | string) {
  return error instanceof Error ? error.message : String(error);
}
