import { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "stream";

export const config = {
  api: {
    bodyParser: false, // Disable body parsing to handle raw streams
  },
};

function setCorsHeaders(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { path: pathParts = [] } = req.query;
  const queryParams = { ...req.query };
  delete queryParams.path;

  const queryString = new URLSearchParams(
    Object.entries(queryParams).flatMap(([key, value]) =>
      Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]]
    ) as string[][]
  ).toString();

  const fullPath = Array.isArray(pathParts) ? pathParts.join("/") : pathParts;

  const targetUrl = `https://originally-firewall-facial-childhood.trycloudflare.com/api/v1/${fullPath}${queryString ? `?${queryString}` : ""}`;
  console.log("[Proxy] →", targetUrl);

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const requestBody = Buffer.concat(chunks);

  try {
    const filteredHeaders = Object.fromEntries(
      Object.entries(req.headers).filter(
        ([, value]) => typeof value === "string"
      )
    );

    const apiRes = await fetch(targetUrl, {
      method: req.method,
      headers: filteredHeaders as HeadersInit,
      body:
        req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS"
          ? undefined
          : requestBody,
    });

    const contentType = apiRes.headers.get("content-type");
    res.status(apiRes.status);

    if (contentType?.includes("application/json")) {
      const data = await apiRes.json();
      if (data?.Data?.redirectUrl) {
        res.redirect(data.Data.redirectUrl);
      } else {
        res.json(data);
      }
    } else {
      const buffer = await apiRes.arrayBuffer();
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      res.send(Buffer.from(buffer));
    }
  } catch (err: any) {
    console.error("[Proxy] Error:", err);
    res.status(500).json({
      error: "Proxy failed",
      detail: err.message || "Unknown error",
    });
  }
}