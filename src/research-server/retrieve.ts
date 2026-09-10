import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { publicUrl } from "../build/model.ts";

const hosts = [
  "namokimods.com",
  "www.namokimods.com",
  "www.alibaba.com",
  "germany.alibaba.com",
  "tandorio.en.alibaba.com",
  "www.timemodule.com",
  "timemodule.com",
  "watchandstyle.net",
  "luciusatelier.com",
  "www.youtube.com",
  "www.reddit.com",
];
export function allowedURL(raw: string) {
  const u = new URL(publicUrl.parse(raw));
  if (
    (!hosts.includes(u.hostname) &&
      !/^[a-z0-9-]+\.en\.alibaba\.com$/.test(u.hostname)) ||
    isIP(u.hostname) ||
    /(?:account|checkout|cart|admin|login|contact|messages|trade\/)/i.test(
      decodeURIComponent(u.pathname),
    )
  )
    throw new Error("URL is outside permitted public discovery sources.");
  if (
    [...u.searchParams].some(
      ([k, v]) =>
        !["variant", "code", "v"].includes(k) ||
        !/^[a-zA-Z0-9_-]{1,40}$/.test(v),
    )
  )
    throw new Error("URL query is not an allowed public identifier.");
  u.hash = "";
  return u;
}
export function publicAddress(address: string) {
  if (isIP(address) !== 4) return false; // BI-1 pins public IPv4; no mapped/reserved IPv6 ambiguity.
  const [a, b] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}
export function robotsAllows(text: string, path: string) {
  const groups: {
    agents: string[];
    rules: { allow: boolean; value: string }[];
  }[] = [];
  let group = {
    agents: [] as string[],
    rules: [] as { allow: boolean; value: string }[],
  };
  for (const line of text.split(/\r?\n/)) {
    const [name, ...rest] = line.split("#")[0].split(":");
    const value = rest.join(":").trim(),
      directive = name.trim().toLowerCase();
    if (directive === "user-agent") {
      if (group.rules.length) {
        groups.push(group);
        group = { agents: [], rules: [] };
      }
      group.agents.push(value.toLowerCase());
    } else if (value && ["allow", "disallow"].includes(directive))
      group.rules.push({ allow: directive === "allow", value });
  }
  groups.push(group);
  const specific = groups.some((g) => g.agents.includes("watchatelier"));
  let best = -1,
    allowed = true;
  for (const { value, allow } of groups
    .filter((g) => g.agents.includes(specific ? "watchatelier" : "*"))
    .flatMap((g) => g.rules)) {
    const pattern =
      "^" +
      value
        .split("*")
        .map((s) => s.replace(/[.+?^{}()|[\]\\]/g, "\\$&"))
        .join(".*");
    if (new RegExp(pattern).test(path) && value.length >= best) {
      if (value.length > best || allow) allowed = allow;
      best = value.length;
    }
  }
  return allowed;
}
export async function requestText(
  url: URL,
  signal: AbortSignal,
): Promise<{ url: string; status: number; type: string; text: string }> {
  allowedURL(url.href);
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Source DNS is not exclusively public.");
  signal.throwIfAborted();
  const result = await new Promise<{
    status: number;
    type: string;
    text: string;
    redirect?: string;
  }>((resolve, reject) => {
    const request = https.get(
      url,
      {
        signal,
        agent: false,
        headers: {
          "User-Agent": "WatchAtelier/BI-1 (user-triggered research)",
          Accept: "text/html,text/plain,application/json",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, 4);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const status = response.statusCode ?? 0,
          type = response.headers["content-type"] ?? "";
        if (status >= 300 && status < 400) {
          response.resume();
          resolve({
            status,
            type,
            text: "",
            redirect: response.headers.location,
          });
          return;
        }
        if (
          !/^(text\/(?:html|plain)|application\/(?:json|xhtml\+xml))/i.test(
            type,
          ) &&
          !(url.pathname === "/robots.txt" && !type)
        ) {
          response.destroy();
          reject(new Error("Source content type is unsupported."));
          return;
        }
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2 * 1024 ** 2) {
            response.destroy();
            reject(new Error("Source exceeds 2 MiB."));
          } else chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status,
            type,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        response.on("error", reject);
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error("Source request timed out.")),
      10_000,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
  });
  if (result.redirect) {
    allowedURL(new URL(result.redirect, url).href);
    throw new Error(
      "Source redirects are not automatically followed; select a permitted canonical URL for separate access-policy checking.",
    );
  }
  return { ...result, url: url.href };
}
export async function retrieve(raw: string, signal: AbortSignal) {
  const url = allowedURL(raw);
  const robots = await requestText(new URL("/robots.txt", url), signal);
  if (
    robots.status !== 404 &&
    (robots.status !== 200 || !/user-agent:/i.test(robots.text))
  )
    throw new Error("Source robots/access policy could not be established.");
  if (
    robots.status === 200 &&
    !robotsAllows(robots.text, url.pathname + url.search)
  )
    throw new Error("Source robots policy disallows this path.");
  const result = await requestText(url, signal);
  // A cross-host redirect requires that host's access rules too.
  if (new URL(result.url).origin !== url.origin)
    throw new Error("Cross-host source redirect requires separate discovery.");
  if (
    result.status !== 200 ||
    /captcha|verify you are human|unusual traffic|access denied|punish-page/i.test(
      result.text.slice(0, 15000),
    )
  )
    throw new Error(
      "Source blocked or requires interactive access (HTTP " +
        result.status +
        ").",
    );
  return {
    ...result,
    hash: createHash("sha256").update(result.text).digest("hex"),
  };
}
export function plain(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
