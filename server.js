const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_FILE = path.join(ROOT, "data", "kg.ttl");
const PORT = process.env.PORT || 3000;

const PREFIXES = {
  ":": "http://example.org/sealkg/",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
};

const RELATION_LABELS = {
  zi: "字",
  hao: "号",
  dynasty: "朝代",
  identity: "身份",
  birthYear: "生年",
  deathYear: "卒年",
  sonOf: "父子关系",
  fatherOf: "父子关系",
  studentOf: "师承关系",
  teacherOf: "师承关系",
  friendOf: "交游关系",
  belongsToSchool: "所属流派",
  founded: "开创",
  corePerson: "核心人物",
  label: "名称",
};

let triples = [];

function iri(local) {
  return `http://example.org/sealkg/${local}`;
}

function compact(value) {
  if (!value) return value;
  if (value.startsWith(PREFIXES[":"])) return ":" + value.slice(PREFIXES[":"].length);
  if (value.startsWith(PREFIXES.rdfs)) return "rdfs:" + value.slice(PREFIXES.rdfs.length);
  return value;
}

function localName(value) {
  const c = compact(value);
  if (c.startsWith(":")) return c.slice(1);
  if (c.startsWith("rdfs:")) return c.slice(5);
  return c;
}

function display(value) {
  if (!value) return "";
  if (value.type === "literal") return value.value;
  const label = getLabel(value.value);
  return label || compact(value.value);
}

function parseTerm(raw) {
  const token = raw.trim();
  if (token.startsWith("\"")) {
    const end = token.lastIndexOf("\"");
    return { type: "literal", value: token.slice(1, end) };
  }
  if (token === "a") return { type: "iri", value: iri("type") };
  if (token.startsWith(":")) return { type: "iri", value: iri(token.slice(1)) };
  if (token.startsWith("rdfs:")) return { type: "iri", value: PREFIXES.rdfs + token.slice(5) };
  return { type: "literal", value: token };
}

function loadGraph() {
  const ttl = fs.readFileSync(DATA_FILE, "utf8")
    .replace(/#[^\n\r]*/g, "")
    .replace(/@prefix[\s\S]*?\.\s*/g, "");
  const parsed = [];
  let subject = null;
  for (const raw of ttl.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    const ends = line.endsWith(".");
    line = line.replace(/[.;]\s*$/, "").trim();
    if (!line) continue;
    const parts = line.match(/"[^"]*"|[^\s]+/g) || [];
    if (parts.length >= 3) {
      subject = parseTerm(parts[0]);
      const predicate = parseTerm(parts[1]);
      const object = parseTerm(parts.slice(2).join(" "));
      parsed.push({ s: subject, p: predicate, o: object });
    } else if (subject && parts.length >= 2) {
      const predicate = parseTerm(parts[0]);
      const object = parseTerm(parts.slice(1).join(" "));
      parsed.push({ s: subject, p: predicate, o: object });
    }
    if (ends) subject = null;
  }
  triples = parsed;
}

function getLabel(resource) {
  const labelPred = PREFIXES.rdfs + "label";
  const found = triples.find((t) => t.s.value === resource && t.p.value === labelPred);
  return found ? found.o.value : null;
}

function findPersonByName(name) {
  const labelPred = PREFIXES.rdfs + "label";
  const found = triples.find((t) => t.p.value === labelPred && t.o.value === name);
  return found ? found.s.value : null;
}

function values(subject, predicateLocal) {
  return triples
    .filter((t) => t.s.value === subject && localName(t.p.value) === predicateLocal)
    .map((t) => t.o);
}

function evidence(rows) {
  return rows.map((t) => ({
    subject: display(t.s),
    predicate: RELATION_LABELS[localName(t.p.value)] || localName(t.p.value),
    object: display(t.o),
  }));
}

function sparqlForTool(tool, args) {
  if (tool === "get_person_basic_info") {
    return `SELECT ?zi ?hao ?birthYear ?deathYear ?dynasty ?identity ?schoolName WHERE {
  ?person rdfs:label "${args.name}" .
  OPTIONAL { ?person :zi ?zi . }
  OPTIONAL { ?person :hao ?hao . }
  OPTIONAL { ?person :birthYear ?birthYear . }
  OPTIONAL { ?person :deathYear ?deathYear . }
  OPTIONAL { ?person :dynasty ?dynasty . }
  OPTIONAL { ?person :identity ?identity . }
  OPTIONAL { ?person :belongsToSchool ?school . ?school rdfs:label ?schoolName . }
}`;
  }
  if (tool === "get_person_alias") {
    return `SELECT ?zi ?hao WHERE {
  ?person rdfs:label "${args.name}" .
  OPTIONAL { ?person :zi ?zi . }
  OPTIONAL { ?person :hao ?hao . }
}`;
  }
  if (tool === "get_person_relations") {
    return `SELECT ?relation ?targetName WHERE {
  ?person rdfs:label "${args.name}" .
  ?person ?relation ?target .
  ?target rdfs:label ?targetName .
}`;
  }
  if (tool === "get_relation_between_people") {
    return `SELECT ?relation WHERE {
  ?p1 rdfs:label "${args.person1}" .
  ?p2 rdfs:label "${args.person2}" .
  { ?p1 ?relation ?p2 . }
  UNION
  { ?p2 ?relation ?p1 . }
}`;
  }
  if (tool === "get_school_members") {
    return `SELECT ?personName WHERE {
  ?person :belongsToSchool ?school .
  ?school rdfs:label "${args.school}" .
  ?person rdfs:label ?personName .
}`;
  }
  return "";
}

function toolBasicInfo(name) {
  const person = findPersonByName(name);
  if (!person) return null;
  const fields = ["zi", "hao", "birthYear", "deathYear", "dynasty", "identity"];
  const data = {};
  for (const f of fields) data[f] = values(person, f).map(display);
  data.school = values(person, "belongsToSchool").map(display);
  const rows = triples.filter((t) => t.s.value === person && ["zi", "hao", "birthYear", "deathYear", "dynasty", "identity", "belongsToSchool"].includes(localName(t.p.value)));
  const fragments = [
    `${name}`,
    data.zi[0] ? `字${data.zi[0]}` : "",
    data.hao[0] ? `号${data.hao[0]}` : "",
    data.birthYear[0] || data.deathYear[0] ? `生卒年为${data.birthYear[0] || "?"}-${data.deathYear[0] || "?"}` : "",
    data.dynasty[0] || "",
    data.identity[0] || "",
    data.school[0] ? `所属流派为${data.school[0]}` : "",
  ].filter(Boolean);
  return { answer: fragments.join("，") + "。", evidence: evidence(rows) };
}

function toolAlias(name) {
  const person = findPersonByName(name);
  if (!person) return null;
  const rows = triples.filter((t) => t.s.value === person && ["zi", "hao"].includes(localName(t.p.value)));
  if (!rows.length) return { answer: `知识图谱中暂未找到${name}的字号信息。`, evidence: [] };
  const zi = values(person, "zi").map(display)[0];
  const hao = values(person, "hao").map(display)[0];
  return { answer: `${name}${zi ? `，字${zi}` : ""}${hao ? `，号${hao}` : ""}。`, evidence: evidence(rows) };
}

function toolRelations(name, relationType) {
  const person = findPersonByName(name);
  if (!person) return null;
  const relationMap = {
    "父子": ["sonOf", "fatherOf"],
    "亲属": ["sonOf", "fatherOf"],
    "师承": ["studentOf", "teacherOf"],
    "老师": ["studentOf"],
    "交游": ["friendOf"],
    "朋友": ["friendOf"],
    "流派": ["belongsToSchool", "founded"],
  };
  const allowed = relationType ? relationMap[relationType] || [relationType] : ["sonOf", "fatherOf", "studentOf", "teacherOf", "friendOf", "belongsToSchool", "founded"];
  const rows = triples.filter((t) => allowed.includes(localName(t.p.value)) && (t.s.value === person || t.o.value === person));
  if (!rows.length) return { answer: `知识图谱中暂未找到${name}的相关关系。`, evidence: [] };
  const parts = rows.map((t) => `${display(t.s)} --${RELATION_LABELS[localName(t.p.value)] || localName(t.p.value)}--> ${display(t.o)}`);
  return { answer: `${name}的相关关系包括：${parts.join("；")}。`, evidence: evidence(rows) };
}

function toolRelationBetween(person1, person2) {
  const p1 = findPersonByName(person1);
  const p2 = findPersonByName(person2);
  if (!p1 || !p2) return null;
  const rows = triples.filter((t) => (t.s.value === p1 && t.o.value === p2) || (t.s.value === p2 && t.o.value === p1));
  if (!rows.length) return { answer: `知识图谱中暂未找到${person1}和${person2}之间的直接关系。`, evidence: [] };
  const parts = rows.map((t) => `${display(t.s)} --${RELATION_LABELS[localName(t.p.value)] || localName(t.p.value)}--> ${display(t.o)}`);
  return { answer: `${person1}和${person2}之间存在关系：${parts.join("；")}。`, evidence: evidence(rows) };
}

function toolSchoolMembers(school) {
  const schoolRes = findPersonByName(school);
  const target = schoolRes || triples.find((t) => localName(t.p.value) === "label" && t.o.value === school)?.s.value;
  if (!target) return null;
  const rows = triples.filter((t) => localName(t.p.value) === "belongsToSchool" && t.o.value === target);
  if (!rows.length) return { answer: `知识图谱中暂未找到${school}的人物成员。`, evidence: [] };
  return { answer: `${school}的人物包括：${rows.map((t) => display(t.s)).join("、")}。`, evidence: evidence(rows) };
}

function getKnownNames() {
  return triples
    .filter((t) => localName(t.p.value) === "label")
    .map((t) => t.o.value)
    .sort((a, b) => b.length - a.length);
}

function analyzeQuestion(question) {
  const names = getKnownNames()
    .filter((name) => question.includes(name))
    .sort((a, b) => question.indexOf(a) - question.indexOf(b));
  if (question.toLowerCase().includes("select") || question.toLowerCase().includes("where")) {
    return { intent: "direct_sparql", names };
  }
  if (names.length >= 2 && (question.includes("关系") || question.includes("是不是") || question.includes("什么关系"))) {
    return { intent: "relation_between", names };
  }
  if (question.includes("字") || question.includes("号") || question.includes("字号")) return { intent: "alias", names };
  if (question.includes("师承") || question.includes("老师")) return { intent: "relations", names, relationType: "师承" };
  if (question.includes("父") || question.includes("子") || question.includes("亲属")) return { intent: "relations", names, relationType: "亲属" };
  if (question.includes("交游") || question.includes("朋友")) return { intent: "relations", names, relationType: "交游" };
  if (question.includes("流派")) return { intent: "relations", names, relationType: "流派" };
  if (question.includes("哪些人") || question.includes("有哪些人物") || question.includes("成员")) {
    const school = names.find((n) => n.includes("派")) || names[0] || "吴门印派";
    return { intent: "school_members", names, school };
  }
  return { intent: "basic_info", names };
}

function runWorkflow(question) {
  const trace = [];
  trace.push({ node: "question_analyzer", status: "done", detail: "识别问题意图、抽取人物或流派名称" });
  const analysis = analyzeQuestion(question);
  trace.push({ node: "tool_router", status: "done", detail: `路由到 ${analysis.intent}` });
  let result = null;
  let tool = "";
  let args = {};
  if (analysis.intent === "direct_sparql") {
    result = executeSparql(question);
    return { answer: "已执行高级 SPARQL 查询。", sparql: question, evidence: result.evidence, table: result.table, trace };
  }
  const name = analysis.names[0] || "文彭";
  if (analysis.intent === "alias") {
    tool = "get_person_alias";
    args = { name };
    result = toolAlias(name);
  } else if (analysis.intent === "relations") {
    tool = "get_person_relations";
    args = { name, relationType: analysis.relationType };
    result = toolRelations(name, analysis.relationType);
  } else if (analysis.intent === "relation_between") {
    tool = "get_relation_between_people";
    args = { person1: analysis.names[0], person2: analysis.names[1] };
    result = toolRelationBetween(analysis.names[0], analysis.names[1]);
  } else if (analysis.intent === "school_members") {
    tool = "get_school_members";
    args = { school: analysis.school };
    result = toolSchoolMembers(analysis.school);
  } else {
    tool = "get_person_basic_info";
    args = { name };
    result = toolBasicInfo(name);
  }
  trace.push({ node: "tool_executor", status: "done", detail: `调用工具 ${tool}` });
  const sparql = sparqlForTool(tool, args);
  if (!result) {
    trace.push({ node: "fallback_handler", status: "done", detail: "实体未命中或查询为空" });
    return { answer: "知识图谱中暂未找到相关实体。你可以尝试换一个名称，或在高级查询中直接输入 SPARQL。", sparql, evidence: [], table: [], trace };
  }
  trace.push({ node: "answer_generator", status: "done", detail: "根据查询结果生成自然语言答案和证据" });
  return { answer: result.answer, sparql, evidence: result.evidence, table: result.evidence, trace };
}

function executeSparql(query) {
  const normalized = query.replace(/\s+/g, " ").trim();
  const labelMatch = normalized.match(/rdfs:label\s+"([^"]+)"/);
  const schoolMatch = normalized.match(/:belongsToSchool\s+\?school.*?\?school\s+rdfs:label\s+"([^"]+)"/);
  if (schoolMatch) {
    const r = toolSchoolMembers(schoolMatch[1]) || { evidence: [] };
    return { evidence: r.evidence, table: r.evidence };
  }
  if (labelMatch) {
    const name = labelMatch[1];
    if (normalized.includes("?zi") || normalized.includes("?hao")) {
      const r = toolAlias(name) || { evidence: [] };
      return { evidence: r.evidence, table: r.evidence };
    }
    const r = toolBasicInfo(name) || { evidence: [] };
    return { evidence: r.evidence, table: r.evidence };
  }
  return { evidence: evidence(triples.slice(0, 50)), table: evidence(triples.slice(0, 50)) };
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function serveStatic(req, res) {
  const urlPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };
  res.writeHead(200, { "Content-Type": `${types[ext] || "text/plain"}; charset=utf-8` });
  fs.createReadStream(filePath).pipe(res);
}

loadGraph();

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/ask") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        sendJson(res, runWorkflow(payload.question || ""));
      } catch (err) {
        sendJson(res, { error: err.message }, 500);
      }
    });
    return;
  }
  if (req.method === "POST" && req.url === "/api/sparql") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const result = executeSparql(payload.query || "");
        sendJson(res, { answer: "已执行 SPARQL 查询。", sparql: payload.query, evidence: result.evidence, table: result.table });
      } catch (err) {
        sendJson(res, { error: err.message }, 500);
      }
    });
    return;
  }
  serveStatic(req, res);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`Port ${PORT} is already in use.`);
    console.log(`The web app may already be running at http://localhost:${PORT}`);
    console.log("Keep using the browser page, or close the old command window and start again.");
    return;
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Knowledge QA web app is running at http://localhost:${PORT}`);
});
