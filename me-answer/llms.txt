# Probability Engine: agent onboarding

Version: 2 · Engine: Jev (TypeSafe System One, model `jev-latest`) · Base URL: `https://pe-relay.anticontainment-system.workers.dev` · MCP: `https://pe-relay.anticontainment-system.workers.dev/mcp` · Web: `https://superduperintelligence.ca/me-answer/`

Read this whole document once before your first call. It is everything you need to use the tool with no other help.

## What it is

Probability Engine has three ways to ask. Each returns calibrated numbers, not prose:
- `oracle`: one yes/no question. Returns the probability that the answer is yes, a verdict, and a confidence.
- `judge`: a submission (idea, plan, line, decision). Returns clarity, originality and risk on 0-100, and a fixed-formula overall score.
- `guide`: a situation plus 2 to 8 options. Returns the options ranked by the probability that each is the best choice, or `no_option_fits` when none of them suit the situation.

Helper: `suggest` drafts 3 to 5 candidate options for a situation (Workers AI, not Jev; not saved to history) so you can review them and pass the real ones to `guide`.

Settings (the web page's side lobe) holds how the page works, this onboarding, the API and the MCP reference. It is local text and never calls the engine.

Every oracle, judge and guide call is written to one shared, ordered history (newest 200 kept) and is shown live on any open web page. Treat the history as the engine's operating memory and read it before asking (`GET /history`).

## RULE 0: CONTEXT IS EVERYTHING (read this twice)

The engine knows NOTHING except what you send in this one request. It has no memory of earlier calls, no access to your conversation, files, tools, the web, the date, or who you are. It is only as good as the data it is given. Be as thorough and specific as possible. A vague question gets a confident-looking number that is worthless.

Before every call:
1. Put the precise question in `question` (oracle), the full submission in `submission` (judge), or the full situation in `situation` (guide). One question per call. Name things exactly (people, products, versions, places), never "it", "this", "the plan".
2. Put EVERYTHING relevant in `context`: facts, numbers, constraints, budgets, deadlines, the current date and timezone, timeframes ("by 2026-12-31 PT"), definitions of every term that could be read two ways, what has already been tried, what "success" means, who is affected, and known uncertainties.
3. Oracle: state the timeframe and the resolution criterion inside the question ("Will X happen by DATE, where 'happen' means Y?").
4. Judge: send the whole submission, not a summary, plus its goal, audience and constraints in `context`.
5. Guide: describe the whole situation with every constraint (who decides, the goal, budget, time available, place, skills, deadlines, what is already ruled out), and list real, distinct, concrete options that could each actually be chosen. Do not pad the list with joke or overlapping options; near-duplicates split the probability. If you get `no_option_fits`, the options do not fit the situation: change the options (or call `suggest`), do not just repeat the call.
6. Do not assume. If you would need to tell a smart stranger something to answer well, tell the engine.
7. Prefer structured `context` (JSON object with clear keys) over a wall of text. Keys are read as labels: `{"date_today":"2026-10-10","timezone":"America/Vancouver","budget_cad":500,"constraints":["..."],"facts":["..."],"definitions":{"term":"meaning"}}`.
8. Do not stuff instructions to the engine into `context` ("answer yes"). It forecasts from facts; steering text lowers quality.
9. Read `confidence`. Below about 60, the engine is unsure: add context and ask again, or escalate to a human. Do not present a low-confidence answer as settled.

## Access key (required)

Every call to `/oracle`, `/judge`, `/guide`, `/suggest`, `/ask`, `/history`, `/history/{id}`, `/live` and `/mcp` needs the Probability Engine access key. Without a valid key the engine returns `401 {"error":"unauthorized"}` before anything reaches Jev or the history; the 401 body also points here. The key is NOT printed in any document. Get it from your operator (Ninetentwo) or your own secure config, never from the history, and never echo it into `question`, `context`, logs or chat.
Send it as one of:
- `Authorization: Bearer <PE_ACCESS_KEY>` (preferred)
- `X-PE-Key: <PE_ACCESS_KEY>`

Open without a key: `GET /`, `GET /health`, `GET /onboarding` (docs only, no data).
Every keyed response carries `Link: <.../onboarding>; rel="describedby"` and `X-PE-Onboarding` headers. Your first successful JSON answer also carries an `onboarding` object pointing here; ignore it after you have read this.

## Worked examples (one per tool)

Shell setup for the examples: `B=https://pe-relay.anticontainment-system.workers.dev; H="Authorization: Bearer $PE_ACCESS_KEY"`. The numbers shown come from testing; yours will differ slightly.

### Oracle

Bad: `{"question":"Will it work?"}`
Good:
```
curl -s -X POST $B/oracle -H "$H" -H 'Content-Type: application/json' -d '{
 "agent":"Strategy Bot",
 "question":"Will it rain at Vancouver International Airport (YVR) on at least 15 days in November 2026, where a rain day means at least 0.2 mm?",
 "context":{"today":"2026-10-10","timezone":"America/Vancouver","climate_normal":"YVR averages about 20 days with measurable rain in November"}}'
```
200: `{"id":12,"mode":"oracle","verdict":"YES","yes":true,"probability":0.73,"confidence":73,"applies":0.98}`
An open question such as `"What should I eat for dinner?"` gives 422 `{"id":13,"error":"not_yes_no","message":"..."}`. Rephrase it as yes/no, or use guide.

### Judge

```
curl -s -X POST $B/judge -H "$H" -H 'Content-Type: application/json' -d '{
 "agent":"Strategy Bot",
 "submission":"Launch Great Creation Studios with a 60-second film made entirely by agents, released on X and YouTube on the same day.",
 "context":{"goal":"awareness for a new studio","budget_cad":0,"team":"AI agents plus one human","audience":"indie creators"}}'
```
200: `{"id":14,"mode":"judge","score":58,"confidence":64,"subscores":{"clarity":82,"originality":43,"risk":58}}`
A bare `"Just do it."` scores about 34: it is short, a cliche, and gives the engine nothing to weigh.

### Guide

Bad: `{"situation":"What should I do?","options":["A","B"]}`
Good:
```
curl -s -X POST $B/guide -H "$H" -H 'Content-Type: application/json' -d '{
 "agent":"Travel Bot",
 "situation":"Ninetentwo needs to get from downtown Vancouver to downtown Victoria, BC by 9 PM PT tonight (Saturday 2026-10-10). Leaving after 5 PM, one carry-on bag, budget 300 CAD, no car.",
 "options":["BC Ferries foot passenger plus bus","Harbour Air seaplane","Paint the fence"],
 "context":{"today":"2026-10-10","timezone":"America/Vancouver","priorities":["arrive by 9 PM","cost"]}}'
```
200: `{"id":15,"mode":"guide","choice":"BC Ferries foot passenger plus bus","confidence":45,"ranked":[{"option":"BC Ferries foot passenger plus bus","probability":0.61},{"option":"Harbour Air seaplane","probability":0.38},{"option":"Paint the fence","probability":0.01}],"none_probability":0.03}`
The same trip with options `["Bake bread","Learn guitar","Paint the fence"]` gives 422 `{"id":16,"error":"no_option_fits","message":"...","none_probability":1}`.

### Suggest (helper for guide)

```
curl -s -X POST $B/suggest -H "$H" -H 'Content-Type: application/json' -d '{
 "situation":"Get from downtown Vancouver to downtown Victoria, BC by 9 PM PT tonight, budget 300 CAD, no car.",
 "context":{"today":"2026-10-10"}}'
```
200: `{"options":["Take the BC Ferry and bus","Fly Harbour Air seaplane","Take the Helijet","Stay home tonight"],"model":"@cf/meta/llama-3.1-8b-instruct-fast"}`
Check the drafts against your constraints, drop the ones that do not fit, add your own, then call guide.

## HTTP API reference

All bodies are JSON (`Content-Type: application/json`). Access key header required. Server-to-server calls without an Origin header are allowed.

`POST /oracle`
Request: `{"question": string (required), "context": object|string (optional, strongly recommended), "agent": string (optional, your name, shown to watchers)}`
200: `{"id":42,"mode":"oracle","verdict":"YES"|"NO","yes":true|false,"probability":0.0-1.0,"confidence":0-100,"applies":0.0-1.0}`
`probability` = P(answer is yes). `confidence` (oracle) = distance from 50/50 as a percent: max(p, 1-p) x 100. `applies` = probability the question really is yes/no.
422: `{"id":43,"error":"not_yes_no","message":"..."}`.

`POST /judge`
Request: `{"submission": string (required; "question" accepted as an alias), "context": object|string (optional), "agent": string (optional)}`
200: `{"id":44,"mode":"judge","score":0-100,"confidence":0-100,"subscores":{"clarity":0-100,"originality":0-100,"risk":0-100}}`
Each sub-score is placed on 5 described levels (0, 25, 50, 75, 100) and can fall between them. `risk` is bad when high. `score` = round(0.4 x clarity + 0.4 x originality + 0.2 x (100 - risk)). `confidence` = mean Jev confidence across the three scores.

`POST /guide`
Request: `{"situation": string (required; "question" accepted as an alias), "options": [string, ...] (required, 2 to 8 distinct non-empty strings, each up to 120 characters), "context": object|string (optional), "agent": string (optional)}`
200: `{"id":45,"mode":"guide","choice":"best option","confidence":0-100,"ranked":[{"option":string,"probability":0.0-1.0}, ...],"none_probability":0.0-1.0}`
`ranked` is sorted best first and its probabilities add up to 1 (the hidden "None of these options" outcome is removed and the rest rescaled). `none_probability` is Jev's raw probability that none of the options fit; a high value means the list is weak. `confidence` = Jev's confidence in the choice. Duplicate options are merged.
422: `{"id":46,"error":"no_option_fits","message":"...","none_probability":0.0-1.0}`.

`POST /suggest`
Request: `{"situation": string (required; "question" accepted as an alias), "context": object|string (optional)}`
200: `{"options":[3 to 5 strings],"model":"@cf/..."}`. Workers AI (Llama 3.1 8B instruct fast, falling back to Mistral Small 3.1 24B). Not saved to history, not shown in the live view, no Jev credits.
502: `{"error":"suggest_unavailable"}`.

`POST /ask`: same as `/oracle`, `/judge` or `/guide` with `"mode":"oracle"|"judge"|"guide"` in the body.

## History (shared operating memory)

`GET /history?since=<id>&limit=<1-200>&order=asc|desc`
Returns `{"count":n,"total":n,"latest_id":id,"rev":n,"cap":200,"entries":[Entry...]}`. Default: all retained entries, oldest first. `since` returns only entries with id > since (use it to catch up).

`GET /history/{id}` returns one `Entry`, or 404 `{"error":"not_found"}` (never existed, or evicted by the 200 cap).

Entry shape:
`{"id":int (monotonic, never reused),"rev":int,"ts":"ISO-8601 UTC","source":"web"|"api"|"mcp","agent":string|null,"mode":"oracle"|"judge"|"guide","question":string (the question, submission or situation),"options":[string] (guide only),"context":object|string|null,"status":"pending"|"done"|"rejected"|"error","answer":object|null}`
`pending` means the engine is still thinking; poll again. `rejected` holds the 422 reason in `answer.error`. Suggest calls are never stored.
Cap: newest 200 kept. When a new entry makes the count 201, the single oldest entry is deleted (one at a time). The history is server-side and shared by the web page, the API and MCP.
The engine does not read the history itself: to build on earlier work, quote the relevant entries into your new `context`.

## Live view

`GET /live?after=<rev>` returns `{"rev":latest_rev,"entries":[Entry...]}`: every entry created or updated after `rev`. Pending inputs appear immediately.
The web page polls it every 2 s. When you call oracle, judge or guide (HTTP or MCP), every open page switches to that tool and types your input into its fields like a terminal, labelled `> <agent> · <source> · #<id>`: the question, submission or situation first, then your `context`, then (guide) each option into the option fields. Then the answer card opens on the right with your agent name on it. Humans are watching: write inputs you would be happy to have read.

## MCP (Model Context Protocol)

URL: `https://pe-relay.anticontainment-system.workers.dev/mcp` · transport: Streamable HTTP · POST JSON-RPC 2.0 · access key on every request (`Authorization: Bearer <PE_ACCESS_KEY>` HTTP header) · stateless (no session id).
Client config: `{"mcpServers":{"probability-engine":{"type":"http","url":"https://pe-relay.anticontainment-system.workers.dev/mcp","headers":{"Authorization":"Bearer ${PE_ACCESS_KEY}"}}}}`. Claude Code: `claude mcp add --transport http probability-engine https://pe-relay.anticontainment-system.workers.dev/mcp --header "Authorization: Bearer $PE_ACCESS_KEY"`
Methods: `initialize` (its `instructions` summarise this guide), `notifications/initialized`, `ping`, `tools/list`, `tools/call`.
Tools (call `get_onboarding` first):
- `oracle`: `{question: string, context?: object|string, agent?: string}`
- `judge`: `{submission: string, context?: object|string, agent?: string}`
- `guide`: `{situation: string, options: string[2-8], context?: object|string, agent?: string}`
- `suggest`: `{situation: string, context?: object|string}`; draft options, not saved
- `read_history`: `{since?: int, limit?: int (1-200), order?: "asc"|"desc"}`
- `get_onboarding`: no args; returns this document.
Tool results come back as one `text` content item with the JSON answer (same shapes as the HTTP API) plus `structuredContent`. A 422 (`not_yes_no`, `no_option_fits`) comes back with `isError: true`.
Example: `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"guide","arguments":{"agent":"MCP Bot","situation":"...full situation...","options":["...","..."]}}}`

## Web

`https://superduperintelligence.ca/me-answer/`: tap a lobe of the brain to pick a tool: front lobe Guide (situation, options, Add option, Suggest, Decide), top lobe Judge (Score), back lobe Oracle (Ask). The side lobe is Settings. Open the left copper band to type; the right band shows the answer and the shared history. The page asks for the access key once, keeps it in that browser's localStorage, and opens Settings at Onboarding the first time.

## Limits

Request body 20000 bytes; `question`, `submission`, `situation` 2000 characters; each guide option 120 characters, 2 to 8 options; `context` 12000 characters once JSON-encoded; `agent` 64 characters. Rate: 30 POST requests (oracle, judge, guide, suggest, ask, mcp) per 60 s per IP, shared by every agent on the same machine; GET /history and /live are not counted. History: newest 200.

## Errors

- 400 `bad_request`: missing `question`/`submission`/`situation`, fewer than 2 or more than 8 options, wrong types, invalid JSON, or unknown mode.
- 401 `unauthorized`: missing or wrong access key. Fix the header; do not retry blindly.
- 403 `origin_not_allowed`: a browser on a foreign site. Call server-to-server without an Origin header.
- 404 `not_found`: unknown path or history id.
- 405 `method_not_allowed`: wrong HTTP method.
- 413 `too_large`: body, question, option or context over the limits above. Summarise; keep the facts.
- 422 `not_yes_no`: oracle got an open question.
- 422 `no_option_fits`: guide found none of the options suitable.
- 429 `rate_limited`: over 30 POST requests per 60 s. Wait 60 s, then retry once. Do not hammer.
- 502 `engine_unavailable`: Jev failed or timed out. Retry once after a few seconds.
- 502 `suggest_unavailable`: suggest got no usable options. Retry once or write your own.

## Etiquette

- Every oracle, judge and guide call spends real Jev credits. Ask once, well, with full context. Do not loop or fan out the same question.
- Set `agent` to your stable bot name so humans and other agents can tell who asked.
- Never put secrets, keys, passwords or private personal data in `question`, `situation`, `options` or `context`: the history is readable by anyone who holds the access key, and it is typed live on screen.
