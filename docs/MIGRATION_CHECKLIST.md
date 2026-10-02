# 仓库迁移检查清单

## 迁移目标

将当前 Git 仓库完整迁移到稳定目录，使 ChatGPT 桌面版与 Codex CLI 在同一工作树继续开发，并继续发布到现有 ChatGPT Site。

## 必须保留

- `.git/`：提交历史、分支和远端信息；
- `.openai/hosting.json`：现有 Sites 项目绑定；
- `AGENTS.md`、`README.md` 和 `docs/`；
- `dist/` 全部内容，包括本地 Three.js 和规格 JSON；
- 离线及 Docker 部署脚本。

当前 Sites 绑定应为：

```json
{
  "project_id": "appgprj_6ab9287b0fd48191a48589b930c96936",
  "static": {
    "directory": "dist"
  }
}
```

`project_id` 不是应用运行时秘密，但不要随意替换；替换会指向不同 Site。

## 不需要迁移

- `site-v*.tar.gz`：Sites 发布时生成的临时包；
- 浏览器缓存；
- 旧目录中的可重新生成临时文件。

注意：`localStorage` 位于浏览器和站点来源中，不在仓库里。保持原生产 URL 时浏览器数据仍可继续使用；改成新 URL 后不会自动迁移。

## 推荐迁移步骤

1. 确认当前工作树状态：

   ```powershell
   git status --short
   git log -1 --oneline
   ```

2. 提交需要保留的修改；不要复制半完成但未记录的关键改动。
3. 复制整个仓库目录，包括隐藏的 `.git` 和 `.openai`。
4. 在新目录执行：

   ```powershell
   git status
   git log -5 --oneline
   Get-Content .openai\hosting.json
   node --check dist\app.js
   ```

5. 启动离线版并检查页面、规格文件、投影和交互。
6. 在 ChatGPT 桌面版中新建本地项目，添加新目录并设为主目录。
7. Codex CLI 从新目录启动：

   ```powershell
   codex -C "<新仓库绝对路径>"
   ```

8. 在新项目聊天中要求代理先读取 `AGENTS.md`。
9. 用一个小改动完成提交、Sites 保存版本和部署测试。
10. 确认原 URL 已更新后，停止从旧目录发布；旧目录先归档，不立即删除。

## 迁移后验收

- ChatGPT 桌面版能读写新仓库；
- Codex CLI 与桌面版看到相同 `git status`；
- 离线站点正常打开；
- `dam_spec.json` 可加载；
- 坝体比例、空腔、泄槽、投影和侧栏行为正常；
- 原生产 URL 保持不变；
- 新部署生成新的 Sites 版本；
- 新的浏览器界面评注可以映射到新仓库代码。

## 协作规则

- CLI 和桌面版可以共享仓库，但不要同时编辑同一文件。
- 开始工作前检查 `git status`，不要覆盖另一端未提交修改。
- 一个功能一个提交；几何和计算变更在提交信息中明确标注。
- 聊天历史不会随目录迁移。长期决策写入仓库文档，不依赖旧聊天。
