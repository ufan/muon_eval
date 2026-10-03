# 架构说明

## 当前形态

项目是无构建步骤的静态 Web 应用：

```text
index.html + CSS
        ↓ DOM 事件
app.js
 ├─ 读取 dam_spec.json
 ├─ 坐标转换与几何查询
 ├─ Three.js 场景生成
 ├─ DDA 射线追踪
 ├─ 缪子通量/能损近似
 ├─ 投影与热云
 └─ localStorage 与 JSON 导出
```

发布目录固定为 `dist/`，运行时不访问 CDN 或后端 API。

## 核心数据流

```text
dam_spec.json
  → buildSpatialIndex
  → addSolids/addVoids/水力空腔表面
  → Three.js 场景

候选站点 + 设备参数
  → 探测器方向与局部斜率采样
  → traceRay
  → 材料长度与 m.w.e.
  → 地表通量 + 最低能量近似
  → 预计计数/透射率/显著度
  → 投影图、热云和站点评估
```

## 当前计算策略

各步骤的公式、参数、界面输出含义和适用边界详见 `CALCULATION_MODELS.md`。

- 候选点/姿态改变后延迟约 160 ms 更新。
- 投影先计算 25×25 快速预览，随后计算 65×65 最终结果。
- 65×65 像素由设备原生条读出斜率格聚合得到。
- 投影计算按批次让出事件循环，避免页面长时间冻结。
- 通量积分和原生斜率分箱带内存缓存。
- 设备与候选站点状态保存在 `localStorage`。

## 目标架构

保持原生 ES Modules，不急于引入框架：

几何数据契约、Geometry IR、运行时产物与 DD4hep/GDML 后端的详细建议见 `GEOMETRY_SPEC_REFACTOR.md`。

```text
src/
├─ domain/
│  ├─ coordinates.js       坐标和方位转换
│  ├─ geometry.js          规格实体、正/负体积与分类
│  ├─ spatial-index.js     空间索引
│  ├─ ray-tracer.js        DDA 与边界细分
│  ├─ detector.js          设备几何、斜率格和接受度
│  └─ muon-response.js     通量、能损和计数响应
├─ application/
│  ├─ projection.js        预览/最终投影任务
│  ├─ assessment.js        指标、排名和扫描评价
│  ├─ scan.js              站点/姿态参数扫描
│  └─ scenario.js          保存、加载和迁移
├─ view/
│  ├─ scene.js             Three.js 场景
│  ├─ geometry-view.js     表面和辅助结构显示
│  ├─ projection-view.js   Canvas 投影与轮廓
│  └─ ui.js                DOM 与交互
└─ main.js                 初始化和依赖装配
```

## 重构原则

- 先抽离纯函数，不改变 UI 和数值结果。
- 先建立回归测试，再合并视觉几何与计算几何。
- `dam_spec.json` 保持独立、可版本化、可被浏览器与 Geant4 共同消费。
- 扫描功能必须调用与单站点评估相同的计算核心，禁止复制另一套算法。
- 长任务应支持取消、进度和缓存；首选 Web Worker，避免阻塞 UI。
- UI 状态与工程方案状态分离；侧栏展开状态不应进入科学结果文件。

## 建议测试层次

1. 单元测试：坐标互逆、点分类、材料密度、设备斜率格。
2. 几何回归：选定空间点和标准射线的材料标签/长度快照。
3. 投影回归：固定规格、站点和设备参数下的总计数、透射率和若干像素。
4. UI 冒烟：切换站点/姿态、侧栏、投影模式、保存加载。
5. 视觉回归：典型透视、上游正视、横剖面和坝顶俯视截图。
