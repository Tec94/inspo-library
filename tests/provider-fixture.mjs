// Local integration fixture. This is not a model and is never used by the app unless selected manually.
import { createServer } from "node:http";

const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:1420");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const requestBody = JSON.parse(Buffer.concat(chunks).toString());
  if (
    request.url !== "/v1/chat/completions" ||
    requestBody.model !== "Local QA fixture"
  ) {
    response.writeHead(400);
    response.end();
    return;
  }
  response.setHeader("Content-Type", "application/json");
  response.end(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Integration check · selected evidence",
              observations: [
                {
                  text: "This is a test response from the local integration fixture. It confirms the source-to-answer interface; it does not analyze the image.",
                  sources: ["A"],
                  basis: "uncertain",
                },
              ],
              vocabulary: [
                {
                  term: "Evidence review",
                  definition:
                    "Checking the exact sources included before sending a question.",
                },
              ],
              explanation:
                "The request used the evidence-review flow and reached a local HTTP endpoint.",
              recreation:
                "Connect a real vision-capable model to study these references.",
              uncertainty:
                "This fixture cannot make observations about image content.",
            }),
          },
        },
      ],
    }),
  );
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  console.log(JSON.stringify(address));
});
