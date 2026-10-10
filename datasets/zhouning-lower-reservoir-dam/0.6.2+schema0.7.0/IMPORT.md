# v0.7.0 发布包的 Web 接入子集

来源：`archive/zhouning-dam-spec_v0.6.2+schema0.7.0_20261005_full.zip`。
发布标识：`zhouning-lower-reservoir-dam@0.6.2+schema0.7.0`。

本目录保存发布包的权威 JSON、冻结 schema、外置业务数据、发布报告、四档 GLB、两份运行时地形和一致性基准；全部按原字节导入。未导入 GDML、原始 NPZ、图件、作者工具或 Python 编译器，因为它们不是浏览器运行时依赖。重新编译使用原发布包工具及其依赖，不以本目录作为 authoring source。

`CHECKSUMS.sha256` 是上游完整发布清单，包含本目录未导入的文件；不应在此目录直接运行全量 `sha256sum -c`。平台注册表的 `integrity` 固定已导入资产的 SHA-256。导入验证命令同时检查注册表、manifest、schema；提供 `--archive` 时还验证完整上游清单和逐字节导入一致性。

```bash
python3 scripts/check-dataset-release.py --archive archive/zhouning-dam-spec_v0.6.2+schema0.7.0_20261005_full.zip
node --test tests/dataset-v07.test.mjs
node scripts/check-geometry-conformance.mjs --dataset zhouning-lower-reservoir-dam@0.6.2+schema0.7.0
node --test tests/compiled-mesh.test.mjs
node scripts/check-geometry-conformance.mjs --dataset zhouning-lower-reservoir-dam@0.6.2+schema0.7.0 --backend compiled
```

以上命令在仓库根目录运行。Python schema 验证仅用于开发，需要 `jsonschema>=4.10`；运行静态站点不需要 Python 或 npm 包。

当前状态为 `qualification`，默认 UI 仍使用旧格式数据 v0.6.2。`loadDataset(releaseId)` 返回原规格、IR、地形和可按需校验加载的 GLB；不将 v0.7 反向转换成旧格式。主应用可显式选择完整发布标识、compiled 后端与已发布冻结工况。

共享编译网格后端提供 `loadCompiledMeshRuntime(dataset, scenarioId)`，由主应用显式 compiled 路径和独立 `/geometry-preview.html` 使用。该后端对 GLB 构建闭合/绕向检查与 BVH，点查询、材料长度和显示共享同一模型坐标缓冲。材料点与射线门槛由上述命令复现；有限域边缘仍有材料分类差异，不构成真实物理域认证。编译后端的 gate 不放宽发布包材料容差。

IR 的查询接口使用模型坐标；解析基元保留明确的 `geometryFrame=doc_frame`，并通过声明的仿射变换求值。IR 保留实体/空腔/水体、材料、场景变量、容差、access、来源和未知项。它不是已完成的 CSG/网格 IR。

解析资格后端使用编译后的 float32 地形采样，因此仍存在地形边界误差。资格门槛与发布包编译后端门槛分开报告：点一致率至少 99.9%（仅距地形面 ≥5 m），混凝土/水/钢使用发布包射线 P95 门槛，岩体暂为 1.5 m；报告同时输出是否满足原始发布包全部射线门槛。不得以资格通过宣称与编译网格一致。

后续默认切换仍需明确验收与决策；材料并集到源实体的完整语义映射、连续水位的统一场景解析与真实物理域资格仍未解决。主应用禁用不支持的连续水位、旧目标显著度及内部代理；虚几何与标记永不参与材料积分。
