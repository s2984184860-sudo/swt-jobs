# 部署到公网（GitHub Pages）

目标：得到一个**永久免费**的网址，手机随时打开。

## 一次性准备

1. 注册/登录 GitHub：https://github.com
2. 新建仓库：右上角 **+ → New repository**
   - Repository name：`swt-jobs`
   - 选 **Public**（免费 Pages 需要公开仓库）
   - 勾选 **Add a README file**（可选）
   - 点 **Create repository**

## 上传文件

在仓库页面点 **Add file → Upload files**，把下面这些文件拖进去：

- `index.html`
- `app.js`
- `data.js`
- `styles.css`
- `.nojekyll`（隐藏文件，用来关闭 Jekyll 处理）
- `README.md`（可选）

> 不要上传 `preview*.png`、`serve.ps1`，那些是本地用的。

提交：底部 **Commit changes**。

## 开启 Pages

1. 仓库页 **Settings → Pages**
2. **Build and deployment → Source** 选 **Deploy from a branch**
3. Branch 选 **main**，目录选 **/ (root)**，点 **Save**
4. 等 1～2 分钟，页面顶部会出现网址：

```
https://<你的用户名>.github.io/swt-jobs/
```

手机浏览器打开这个地址即可，还可以「添加到主屏幕」当 App 用。

## 以后更新

- 改了 `data.js` 或用「导出 JSON」备份的数据：
  在仓库里点 `data.js` → 铅笔图标 → 粘贴新内容 → Commit
- 网页本身更新：同样上传覆盖即可

## 数据注意

- 网页里添加的岗位存在**那台设备的浏览器**里（localStorage）
- 手机上加的，电脑上看不到；反之亦然
- 想让多设备同步，需要后端（VPS 上的小 API，或 Supabase），可以后续加

## 备选托管

| 平台 | 优点 | 缺点 |
|---|---|---|
| GitHub Pages | 免费、永久、无需信用卡 | 需 GitHub 账号 |
| Cloudflare Pages | 免费、国内访问较快 | 需注册 |
| Vercel | 部署简单 | 国内访问一般 |
| 自己的 VPS | 完全可控、可加数据同步 | 要维护服务器 |

## 临时公网（不想注册时）

电脑上运行 `serve.ps1` 后，用 Cloudflare 临时隧道：

```powershell
cloudflared tunnel --url http://localhost:8080
```

会得到一个 `https://xxxx.trycloudflare.com` 的临时地址，关掉就失效，每次重启都会变。
