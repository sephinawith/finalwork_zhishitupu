const examples = [
  "文彭的字号是什么？",
  "文彭的基本信息是什么？",
  "文彭和文徵明是什么关系？",
  "吴门印派有哪些人物？",
  "文彭的师承关系有哪些？",
  "哪些人与文彭有交游关系？",
];

const tools = [
  {
    name: "get_person_basic_info(name)",
    feature: "查询人物基本信息",
    params: "name: 人物姓名，例如“文彭”",
    returns: "字、号、生卒年、朝代、身份、所属流派及三元组证据",
  },
  {
    name: "get_person_alias(name)",
    feature: "查询人物字号",
    params: "name: 人物姓名，例如“文彭”",
    returns: "人物的字、号及对应证据",
  },
  {
    name: "get_person_relations(name, relation_type)",
    feature: "查询人物关系",
    params: "name: 人物姓名；relation_type: 亲属、师承、交游、流派等",
    returns: "关系路径、关系类型和命中的三元组",
  },
  {
    name: "get_relation_between_people(person1, person2)",
    feature: "查询两个人之间的直接关系",
    params: "person1/person2: 两个人物姓名",
    returns: "两人之间的父子、师承、交游等直接关系",
  },
  {
    name: "get_school_members(school)",
    feature: "查询流派成员",
    params: "school: 流派名称，例如“吴门印派”",
    returns: "属于该流派的人物列表和证据",
  },
  {
    name: "run_sparql_query(query)",
    feature: "执行高级 SPARQL 查询",
    params: "query: 用户输入或系统生成的 SPARQL 语句",
    returns: "查询结果表格、SPARQL 和证据",
  },
];

const $ = (id) => document.getElementById(id);

function rowsToTable(tbody, rows) {
  tbody.innerHTML = "";
  if (!rows || rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" class="empty">暂无结果</td>`;
    tbody.appendChild(tr);
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.subject || ""}</td><td>${row.predicate || ""}</td><td>${row.object || ""}</td>`;
    tbody.appendChild(tr);
  }
}

function renderTrace(trace) {
  const box = $("traceList");
  box.innerHTML = "";
  for (const item of trace || []) {
    const div = document.createElement("div");
    div.className = "trace-item";
    div.innerHTML = `<strong>${item.node}</strong><p>${item.detail}</p>`;
    box.appendChild(div);
  }
}

async function ask() {
  const question = $("question").value.trim();
  if (!question) return;
  $("answerText").textContent = "正在查询知识图谱...";
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const data = await res.json();
  $("answerText").textContent = data.answer || data.error || "查询失败";
  $("sparqlView").textContent = data.sparql || "";
  rowsToTable($("evidenceBody"), data.evidence || data.table || []);
  renderTrace(data.trace || []);
}

async function runSparql() {
  const query = $("sparqlInput").value.trim();
  if (!query) return;
  const res = await fetch("/api/sparql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  rowsToTable($("sparqlBody"), data.table || data.evidence || []);
}

for (const q of examples) {
  const btn = document.createElement("button");
  btn.textContent = q;
  btn.addEventListener("click", () => {
    $("question").value = q;
    ask();
  });
  $("examples").appendChild(btn);
}

for (const tool of tools) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${tool.name}</td><td>${tool.feature}</td><td>${tool.params}</td><td>${tool.returns}</td>`;
  $("toolBody").appendChild(tr);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-page").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(tab.dataset.tab).classList.add("active");
  });
});

$("askBtn").addEventListener("click", ask);
$("sparqlBtn").addEventListener("click", runSparql);
$("question").addEventListener("keydown", (event) => {
  if (event.key === "Enter") ask();
});

ask();
