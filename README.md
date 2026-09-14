# 船只进销系统：正式工程（阶段 1）

已实现：双语宣传页、登录、首次改密、登录失败锁定、闲置会话、管理员/业务员权限、账号管理与重置密码、五类基础资料、公司设置、审计记录、PostgreSQL 数据持久化。

当前是本地开发版本，尚未上线。订单、资金、发票等按阶段 2 起继续交付；工作台不展示模拟账务。待确认事项见根目录 [ToBeDecide.md](../ToBeDecide.md)。

默认品牌按用户要求改为“船只进销系统”。基础资料页面是开发者提出的可选辅助录入方案，与官网无关，V2 原文没有独立模块要求，是否保留见 D09；当前保留代码供评估，不作为客户必验项。

## 目录

- `frontend/`：React + TypeScript + Vite + Ant Design + react-i18next。
- `backend/`：Django 5.2 + DRF，数据库迁移、接口及测试。
- `scripts/`：本地 PostgreSQL 初始化、启动、停止。
- `.env.local`、`.local/`：本机秘密、数据库及临时运行资料，不提交版本库。
- `../demo/`：原 Demo，保留不改。

## Windows 首次配置

在项目 `app` 目录执行。需要 Python 3.10+、Node.js 20.19+、PostgreSQL 18 程序可用。`PG_BIN` 可指定 PostgreSQL 的 bin 目录，默认通过 `psql.exe` 查找。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm.cmd --prefix frontend ci
.\.venv\Scripts\python.exe scripts/init_local.py
.\.venv\Scripts\python.exe backend/manage.py migrate
.\.venv\Scripts\python.exe backend/manage.py bootstrap_admin --username admin
```

初始化脚本仅创建本项目 `.local/postgres` 实例，端口 55432、监听本机、SCRAM 密码认证。开发数据库角色拥有本地建库权限供测试使用；生产需另建最小权限账号。已存在的配置和账号不会被初始化命令覆盖。

当前机器已完成依赖安装、迁移及初始管理员创建。初始账号资料位于 `.local/初始账号.md`，首次登录必须改密。不要将此文件或 `.env.local` 发给客户或提交代码；正式部署重新生成凭据。

## 启动与停止

```powershell
.\scripts\start.ps1
cloudflared tunnel --url http://127.0.0.1:5173
# 使用后停止本项目服务，保留数据库
.\scripts\stop.ps1
```

官网：<http://127.0.0.1:5173/>；登录：<http://127.0.0.1:5173/login>；后端：127.0.0.1:8000。均为本机地址，不是外网链接。

启动脚本隐藏窗口，日志在 `.local/`。停止脚本按 PID 和进程启动时间匹配本项目进程，再停止项目独立 PostgreSQL 实例，不删除数据。端口占用时明确报错，不自动结束其他程序。

也可分别运行后端 `python backend/manage.py runserver 127.0.0.1:8000 --noreload` 和前端 `npm.cmd --prefix frontend run dev`，各用 Ctrl+C 停止。

## 使用流程

1. 管理员登录并设置个人密码。
2. 公司设置填写真实公司信息；该内容用于内部单据，公开官网仍独立维护。
3. 账号管理新增业务员，指定初始密码；业务员首次登录同样改密。
4. 基础资料选择客户/供应商/油品/港口/销售员，新建、编辑或停用。资料编码在各分类内唯一。
5. 右上角切换语言，游客偏好存当前浏览器，登录用户偏好存数据库；现有表单输入保持不变。

权限与 API 详见 [阶段 0 设计基线](../docs/stage0/阶段0_设计基线.md)。账号只能停用，基础资料只能停用，物理删除与后续账务权限待确认。

## 验证

以下命令供用户手动执行。按 2026-09-13 协作约定，后续开发默认仅修改代码与补充测试代码，不自动执行检查、构建、迁移或启动服务；未经用户明确要求，不运行本节命令。历史测试结果仅对应当时版本。

```powershell
.\.venv\Scripts\python.exe backend/manage.py check
.\.venv\Scripts\python.exe backend/manage.py test core --noinput
npm.cmd --prefix frontend run build
```

后端测试自动创建并销毁 `test_marine` 数据库，不在日常库运行破坏性测试。覆盖 CSRF、认证、锁定、闲置、权限、会话撤销、资料校验、事务回滚和语言保存；前端构建执行 TypeScript 检查。

## 生产准备（阶段 7）

复制 `.env.example` 配置实际环境，`DJANGO_DEBUG=false`，真实域名、可信 HTTPS Origin、安全 Cookie；使用 Nginx 同域代理和 WSGI 服务，不使用 Vite/Django 开发服务器。数据库、附件鉴权、备份恢复、日志轮转、自动启动和迁移需在阶段 7 完整验收。当前不宣称已实现生产运维。

不要公开 `.local/`、`.env.local`、源代码或数据库端口。所有密码均为随机本地初始化或管理员输入，应用无内置通用登录密码。
