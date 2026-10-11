# Probability Engine: agent onboarding

Version: 3 · Engine: Jev (TypeSafe System One, model `jev-latest`) · Base URL: `https://pe-relay.anticontainment-system.workers.dev` · MCP: `https://pe-relay.anticontainment-system.workers.dev/mcp` · Web: `https://superduperintelligence.ca/me-answer/`

## Before your first call

Check all five, every call:
1. **Today's date and your timezone** in `context`: `"today":"2026-10-10","timezone":"America/Vancouver"`.
2. **One precise question.** Name things exactly. Never "it", "this" or "the plan".
3. **Definitions.** Say what every fuzzy word means. Oracle: say what counts as yes and by when.
4. **Every fact and constraint in `context`:** numbers, budget, deadline, place, skills, what is ruled out, what success means.
5. **`agent`** set to your stable bot name.

If a response carries `warnings`, do what its `fix` says and ask again. If it carries `advice`, confidence is under 60: add context and ask again.

## Never send the left column

Real results from our own cold test (same engine, same day):

| Never send this | Send this |
|---|---|
| **Oracle**, no context: `{"question":"Will AI tutors be common in Canadian schools by 2030?"}` gave **YES 60%** | Same question plus `where "common" means at least 40% of publicly funded K-12 schools use an AI tutoring tool for core subjects at least weekly`, and `context` with today, timezone, a definition of "AI tutor" and three facts (provincial systems, current pilots, student-privacy rules) gave **NO 56%**. The answer flipped. |
| **Guide**, no context: `{"situation":"Choosing a weekend project for a beginner woodworker","options":["Picture frame","Birdhouse","Cutting board"]}` gave **Picture frame, confidence 17** (a near coin toss) | The full situation (finish by Sunday 8 PM PT, hand tools only, table saw and router ruled out, 80 CAD, must be a useful gift) with five concrete options gave **Simple pine cutting board, confidence 71** (76% likely best). |

The left column looks like an answer and is worthless. Full payloads for the right column are in the tool sections below.

## RULE 0: the engine knows nothing you do not send

It has no memory of earlier calls, no access to your conversation, files, the web, the date, or who you are. It is only as good as the data it is given. Be as thorough and specific as possible: if a smart stranger would need to be told something to answer well, tell the engine.

## What it is

Three tools, each returning calibrated numbers, not prose:
- `oracle`: one yes/no question. Returns P(yes), a verdict and a confidence.
- `judge`: a submission (idea, plan, line, decision). Returns clarity, originality and risk on 0-100 and a fixed-formula overall score.
- `guide`: a situation plus 2 to 8 options. Returns the options ranked by P(best), or `no_option_fits`.
- Helper `suggest`: drafts 3 to 5 options for guide (Workers AI, not Jev; not saved).

Every oracle, judge and guide call goes into one shared, ordered history (newest 200) and is played live on any open web page.

## Rules (the checklist above, plus these)

1. **Oracle:** put the timeframe and the resolution criterion inside the question: "Will X happen by DATE, where X means Y?". Open questions (what, which, how) are rejected as `not_yes_no`; use guide for those.
2. **Judge:** send the whole submission (what, for whom, how, cost, timeline), never a one-liner, plus its goal, audience and constraints in `context`.
3. **Guide:** describe the whole situation (who decides, goal, budget, time, place, skills, deadline, what is ruled out) and list 2 to 8 real, distinct, concrete options. No joke or overlapping options; near-duplicates split the probability. On `no_option_fits`, change the options (or call `suggest`); do not repeat the call.
4. **Structured `context`:** a JSON object with clear keys (`today`, `timezone`, `facts`, `constraints`, `definitions`, `budget_cad`, `deadline`, `success_means`). Quote earlier history entries into it if you build on them; the engine does not read the history itself.
5. **Facts, not instructions:** never put "answer yes" or other steering in `context`.
6. **Confidence under 60 means unsure:** add context and ask again, or escalate to a human. Never present it as settled.
7. **No secrets:** never put keys, passwords or private personal data in any field. The history is shared and inputs are shown live on screen.

## Warnings, fix and advice (soft guardrails)

Thin inputs still get an answer, plus these fields so you can fix the call:
- `warnings`: a list of codes. `low_context` (no or very short `context`), `no_date` (no today's date), `no_timezone`, `short_question` (Oracle question under 60 characters), `no_timeframe` (Oracle question with no date or "by when"), `thin_submission` (Judge submission under 15 words), `short_situation` (Guide situation under 80 characters), `vague_situation` (Suggest situation too vague to draft from).
- `fix`: plain instructions for each warning, ending with a pointer to this section.
- `docs`: the URL of this guide.
- `advice`: `"Add context and ask again"` whenever `confidence` is under 60.

Example: the bare woodworking call above returns the answer plus `"warnings":["low_context","no_date","no_timezone","short_situation"]`, a `fix`, and `"advice":"Add context and ask again"`. The full call returns no warnings.

## Access key (required)

Every call to `/oracle`, `/judge`, `/guide`, `/suggest`, `/ask`, `/history`, `/history/{id}`, `/live` and `/mcp` needs the Probability Engine access key. Without a valid key the engine returns `401 {"error":"unauthorized"}` before anything reaches Jev or the history; the 401 body also points here. The key is NOT printed in any document. Get it from your operator (Ninetentwo) or your own secure config, never from the history, and never echo it into `question`, `context`, logs or chat.
Send it as one of:
- `Authorization: Bearer <PE_ACCESS_KEY>` (preferred)
- `X-PE-Key: <PE_ACCESS_KEY>`

Open without a key: `GET /`, `GET /health`, `GET /onboarding` (docs only, no data).
Every keyed response carries `Link: <.../onboarding>; rel="describedby"` and `X-PE-Onboarding` headers. Your first successful JSON answer also carries an `onboarding` object pointing here, and every `warnings` answer carries a `fix` and `docs` pointing here.

## Tools, each led by a full good example

Shell setup: `B=https://pe-relay.anticontainment-system.workers.dev; H="Authorization: Bearer $PE_ACCESS_KEY"`. Numbers come from our tests; yours will differ slightly.

### Oracle (yes/no probability)

```
curl -s -X POST $B/oracle -H "$H" -H 'Content-Type: application/json' -d '{
 "agent":"Strategy Bot",
 "question":"Will AI tutors be common in Canadian schools by 2030, where \"common\" means at least 40% of publicly funded K-12 schools use an AI tutoring tool for core subjects at least weekly?",
 "context":{"today":"2026-10-10","timezone":"America/Vancouver",
  "definitions":{"AI tutor":"software that gives personalized instruction or practice feedback using a large language model or similar generative model"},
  "facts":["Canada has provincial education systems with different tech adoption paces","Several Canadian school boards already pilot ChatGPT-style tools under policy constraints","Privacy law (PIPEDA / provincial student-data rules) slows cloud AI rollout"],
  "timeframe":"by 2030-12-31"}}'
```
200: `{"id":16,"mode":"oracle","verdict":"NO","yes":false,"probability":0.44,"confidence":56,"applies":0.96,"advice":"Add context and ask again"}`
Confidence 56 is honest: the outcome really is close. Bare, the same topic said YES 60% with warnings `low_context`, `no_date`, `no_timezone`, `short_question`.
An open question such as `"What should I eat for dinner?"` gives 422 `{"error":"not_yes_no"}`. Rephrase it as yes/no, or use guide.

### Judge (score 0-100)

```
curl -s -X POST $B/judge -H "$H" -H 'Content-Type: application/json' -d '{
 "agent":"Strategy Bot",
 "submission":"Weekly Fresh Loaf Club: households in Canadian towns under 15,000 people pay 28 CAD per month and receive one artisan sourdough loaf each week. A partner bakery within 50 km bakes on a fixed schedule; a local contractor delivers doorstep on one weekday morning. No cold chain. First towns: Salmon Arm and Nelson, BC. Marketing via community Facebook groups and one bakery window flyer. Seed budget under 20,000 CAD; founder drives first two routes.",
 "context":{"today":"2026-10-10","timezone":"America/Vancouver","goal":"break even in 12 months","audience":"households in small Canadian towns who buy supermarket bread",
  "constraints":["low delivery density","partner bakery capacity 40 loaves/week to start","no refrigerated van","founder is sole operator for first 90 days"]}}'
```
200: `{"id":23,"mode":"judge","score":55,"confidence":67,"subscores":{"clarity":83,"originality":35,"risk":63}}`
A bare `"Just do it."` scores 32 with confidence 38 and comes back with `thin_submission` and advice: it gives the engine nothing to weigh.

### Guide (rank options)

```
curl -s -X POST $B/guide -H "$H" -H 'Content-Type: application/json' -d '{
 "agent":"Maker Bot",
 "situation":"Ninetentwo is choosing a weekend woodworking project for a true beginner. Window: Saturday 2026-10-11 and Sunday 2026-10-12 only, finish by Sunday 8 PM America/Vancouver. Space: one garage workbench. Tools available: hand saw, cordless drill, sandpaper, wood glue, measuring tape, clamps. Ruled out: table saw, power planer, router. Budget: about 80 CAD for lumber and finish. Goal: a finished useful object that can be gifted.",
 "options":["Simple pine cutting board (no handles, food-safe oil finish)","Small wall shelf with two store-bought brackets","Birdhouse from a basic kit-style plan (pre-cut optional)","Decorative wooden coat rack with 3 pegs","Full dining table with mortise-and-tenon joinery"],
 "context":{"today":"2026-10-10","timezone":"America/Vancouver","skill_level":"beginner; no prior furniture builds","budget_cad":80,"deadline":"2026-10-12T20:00:00-07:00",
  "priorities":["finishable in one weekend","useful gift","matches beginner tools"],"success_means":"assembled, sanded, finished and giftable by Sunday 8 PM PT"}}'
```
200: `{"id":25,"mode":"guide","choice":"Simple pine cutting board (no handles, food-safe oil finish)","confidence":71,"ranked":[{"option":"Simple pine cutting board (no handles, food-safe oil finish)","probability":0.76},{"option":"Small wall shelf with two store-bought brackets","probability":0.16},{"option":"Birdhouse from a basic kit-style plan (pre-cut optional)","probability":0.04},{"option":"Decorative wooden coat rack with 3 pegs","probability":0.04},{"option":"Full dining table with mortise-and-tenon joinery","probability":0}],"none_probability":0}`
Options that do not fit the situation at all (say `["Bake bread","Learn guitar","Paint the fence"]`) give 422 `{"error":"no_option_fits"}`.

### Suggest (draft options for guide)

```
curl -s -X POST $B/suggest -H "$H" -H 'Content-Type: application/json' -d '{
 "situation":"A true beginner woodworker wants one project to finish this weekend as a gift, hand tools only (saw, drill, clamps, sandpaper), budget 80 CAD.",
 "context":{"today":"2026-10-10","ruled_out":["table saw","router"]}}'
```
200: `{"options":["...3 to 5 short, real, distinct options..."],"model":"@cf/meta/llama-3.1-8b-instruct-fast"}`
Suggest drafts; it does not decide and is not saved. Drop drafts that break your constraints, add your own, then call guide. A vague situation (say `"Pick a project"`) comes back with `vague_situation`.

## HTTP API reference

All bodies are JSON (`Content-Type: application/json`). Access key header required. Any 200 below may also carry `warnings`, `fix`, `docs` and `advice` (see Warnings). Server-to-server calls without an Origin header are allowed.

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
200: `{"options":[3 to 5 strings],"model":"@cf/..."}` (plus `warnings`/`fix` on a vague situation). Workers AI (Llama 3.1 8B instruct fast, falling back to Mistral Small 3.1 24B). Not saved to history, not shown in the live view, no Jev credits.
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

## Using the web page

`https://superduperintelligence.ca/me-answer/` (asks for the access key once, keeps it in that browser, and opens Settings at Onboarding the first time).
If you drive it with a browser:
1. **Tap a tool.** Use the labelled buttons `Guide tool`, `Judge tool`, `Oracle tool` or `Settings` (in the accessibility tree; on screen they are the brain's front, top, back and side lobes). You do not need to click the spinning brain.
2. **Type into the fields** of the question panel: `Oracle question`, `Judge submission`, or `Guide situation` plus `Option 1`, `Option 2`... (`Add option` adds a row, `Suggest` drafts options).
3. **Press the submit button:** `Ask` (Oracle), `Score` (Judge) or `Decide` (Guide).
4. **Let the page switch the panels itself.** The answer panel opens on its own when the answer lands. Do not open or close panels yourself; the `Close question panel` and `Close answer panel` buttons are for people.

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
- Humans watch the live view: write inputs you would be happy to have read.
