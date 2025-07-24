import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { path = [] } = req.query;

    const queryParams = { ...req.query };
    delete queryParams.path;

    const queryString = new URLSearchParams(
        Object.entries(queryParams).flatMap(([key, value]) =>
            Array.isArray(value) ? value.map(v => [key, v]) : [[key, value]]
        ) as string[][]
    ).toString();

    const fullPath = Array.isArray(path) ? path.join("/") : path;

    const targetUrl = `http://118.69.53.27:7066/api/v1/${fullPath}${queryString ? `?${queryString}` : ""}`;
    console.log("[Proxy] →", targetUrl);

    try {
        const apiRes = await fetch(targetUrl, {
            method: req.method,
            headers: {
                "Content-Type": "application/json",
            },
            body: req.method === "GET" || req.method === "HEAD" ? undefined : JSON.stringify(req.body),
        });

        const contentType = apiRes.headers.get("content-type");

        if (contentType?.includes("application/json")) {
            const data = await apiRes.json();
            res.status(apiRes.status).json(data);
        } else {
            const text = await apiRes.text();
            res.status(apiRes.status).send(text);
        }
    } catch (err: any) {
        res.status(500).json({
            error: "Proxy failed",
            detail: err.message || "Unknown error"
        });
    }
}
