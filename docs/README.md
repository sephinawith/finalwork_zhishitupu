# 印学知识图谱问答系统

这是一个用于课程大作业“问答系统 30 分”部分的网页项目。系统基于已有 RDF/Turtle 知识图谱，提供自然语言问答、高级 SPARQL 查询、查询证据展示和 LangGraph 风格工作流展示。

## 运行方式

```powershell
cd outputs\qa_web
node server.js
```

浏览器访问：

```text
http://localhost:3000
```

## 文件结构

```text
qa_web/
  server.js              # 后端服务、工作流、工具层、SPARQL 子集执行
  data/kg.ttl            # 示例 RDF/Turtle 知识图谱
  public/index.html      # 网页结构
  public/styles.css      # 页面样式
  public/app.js          # 前端交互
  docs/README.md         # 项目说明
```

## 问答系统设计

系统采用 LangGraph 风格的多节点工作流：

1. `question_analyzer`：解析用户问题，识别人物、流派和查询意图。
2. `tool_router`：判断应调用本地工具还是高级 SPARQL 查询。
3. `tool_executor`：调用封装好的查询工具，例如字号查询、关系查询、流派成员查询。
4. `sparql_executor`：执行生成或输入的 SPARQL 查询。
5. `answer_generator`：根据查询结果生成自然语言答案。
6. `fallback_handler`：处理实体不存在、查询为空等情况。

## 已实现工具

- `get_person_basic_info(name)`：查询人物基本信息。
- `get_person_alias(name)`：查询人物的字、号。
- `get_person_relations(name, relation_type)`：查询人物关系。
- `get_relation_between_people(person1, person2)`：查询两个人之间的直接关系。
- `get_school_members(school)`：查询流派成员。
- `run_sparql_query(query)`：高级 SPARQL 查询入口。

## 示例问题

- 文彭的字号是什么？
- 文彭的基本信息是什么？
- 文彭和文徵明是什么关系？
- 吴门印派有哪些人物？
- 文彭的师承关系有哪些？
- 哪些人与文彭有交游关系？

## 如何替换成小组最终知识图谱

将同学抽取出的 Turtle 文件复制到：

```text
data/kg.ttl
```

保持常用谓词一致即可直接使用，例如：

```ttl
:WenPeng rdfs:label "文彭" ;
  :zi "寿承" ;
  :hao "三桥" ;
  :studentOf :WenZhengming ;
  :friendOf :HeZhen ;
  :belongsToSchool :WumenSchool .
```

如果你们的本体谓词名称不同，只需要修改 `server.js` 里的 `RELATION_LABELS` 和各工具函数中的谓词名。
