# dsh-remote-access

让加入 ZeroTier 网络的设备通过浏览器访问 DSH Web GUI。插件在 DSH Host 进程内建立 TCP 转发，只绑定 ZeroTier IPv4 网卡，不会把 DSH 服务监听到 `0.0.0.0`。默认允许所绑定 ZeroTier 网络中的所有成员访问 DSH 登录页；认证仍由 DSH 自己处理。

插件还可通过当前公开的 `webServer.tapIndex()` 接口注入可选的旧版 WebKit 兼容垫片。

## 兼容性

- 目标版本：DSH `0.2.2-rc.1` 及后续提供 `webServer.getOrigin()` 和 `webServer.tapIndex()` 的 0.2.x 版本。
- Node.js 20.16 或更新版本。Cordis patch 使用 `process.getBuiltinModule()`。
- ZeroTier One 网卡名需符合 `ZeroTier One [network-id]` 格式；插件发现并绑定其非内部 IPv4 地址。
- 插件不访问 WebServer 的私有 HTTP Server，也不篡改 Connection 的认证内部状态。
- 不提供资源缓存：当前 WebServer 没有公开原始 HTTP response 生命周期作为插件扩展点。

## 网络拓扑

在运行 DSH 的电脑上安装并加入 ZeroTier 网络。手机、平板和其他电脑也加入同一个网络并在 ZeroTier Central 中获准后，浏览器访问：

```text
http://<运行 DSH 的电脑的 ZeroTier IPv4 地址>:3080/
```

其中 `3080` 是插件 `remotePort` 默认值；如修改了配置，客户端 URL 也要使用新端口。示例中的地址必须替换为主机实际的 ZeroTier Managed IP，不要使用 `127.0.0.1`、家用局域网地址或公网地址。

所有成员必须在 ZeroTier Central 中授权加入网络。仅安装客户端或发送 Network ID 不会自动获准联网。访问后使用 DSH 正常的登录/认证流程；插件不会创建或共享 DSH 账号。

## 安装 ZeroTier

### 1. 安装并加入网络

先在运行 DSH 的主机上安装 ZeroTier One，再按设备平台安装客户端。请从 ZeroTier 官方下载页或对应平台的官方应用商店安装客户端：<https://www.zerotier.com/download/>。

| 设备平台 | 操作 |
| --- | --- |
| Windows 主机或客户端 | 安装并启动 ZeroTier One。在托盘菜单选择加入网络并输入 Network ID；也可在管理员终端运行 `zerotier-cli join <NETWORK_ID>`。在 ZeroTier Central 授权该设备。 |
| macOS 主机或客户端 | 安装并启动 ZeroTier One 菜单栏应用，选择加入网络并输入 Network ID；在 Central 授权设备。 |
| Linux 主机或客户端 | 按发行版指南安装并启动 `zerotier-one` 服务，然后运行 `sudo zerotier-cli join <NETWORK_ID>`；在 Central 授权设备。用 `sudo zerotier-cli listnetworks` 检查网络状态。 |
| iPhone / iPad | 从 App Store 安装 ZeroTier One，添加 Network ID 并启用该网络的 VPN 配置；在 Central 授权设备。设备显示已连接后，打开浏览器访问主机的 ZeroTier IP。 |
| Android 手机 / 平板 | 从 Google Play 安装 ZeroTier One，添加并启用 Network ID；在 Central 授权设备。设备显示已连接后，打开浏览器访问主机的 ZeroTier IP。 |

在 ZeroTier Central 的对应 Network 页面中确认设备已授权，且每台设备均有 Managed IP。主机、客户端应属于可互通的同一个网络；若配置了多个 ZeroTier 网络，插件默认会绑定它们各自的 IPv4 地址。

### 2. 安装插件 Bundle

获取本插件源码目录，或取得 `dsh-remote-access-0.2.0.tgz` 并解压到一个本地目录。包内应有 `package.json`、`cordis.patch.yml`、`README.md` 和 `lib/`。

也可以选择以下方式获取插件，再执行下方的 **安装 Bundle** 步骤。

**通过 npm 从本 GitHub 仓库安装：**

```bash
npm install --prefix ./dsh-plugins --no-save "https://github.com/madoka333/dsh-remote-access/archive/refs/heads/main.tar.gz"
```

**通过 npm 安装本地发布包：**

从[仓库](https://github.com/madoka333/dsh-remote-access)下载 `dsh-remote-access-0.2.0.tgz`，在压缩包所在目录运行：

```bash
npm install --prefix ./dsh-plugins --no-save ./dsh-remote-access-0.2.0.tgz
```

以上两种 npm 方式的插件目录均为 `dsh-plugins/node_modules/dsh-remote-access`。安装 Bundle 时使用该目录的绝对路径。npm 只负责下载和安装包，不会自动应用 DSH 的 `cordis.patch.yml`。

**通过 Git 获取源码：**

```bash
git clone https://github.com/madoka333/dsh-remote-access.git
```

插件目录为克隆后的 `dsh-remote-access`，运行入口已经随源码提供，无需构建。

> **npm 同名包提示：** npm registry 中的 `dsh-remote-access` 属于其他作者，其仓库为 `KongXiangning/dsh-remote-access`，并非本仓库的插件。请使用上面的 GitHub URL 或本地发布包，不要直接运行 `npm install dsh-remote-access`。

在 DSH Web GUI 的插件管理器中使用 **Install bundle / 安装 Bundle** 操作，选择该本地插件目录；如果管理器接受的是安装目标而非选择器，目标应是包含 `package.json` 的绝对目录路径。等安装结果显示已应用后，按提示重启 DSH。仅运行 `dsh plugin add` 并不等于安装 Cordis Bundle；该命令只是把参数转交给 profile 中的 pnpm。

> **重要：先检查 `connection` 配置。** `cordis.patch.yml` 为添加 ZeroTier Host fence 而 patch `connection` 行，而 Cordis 对目标行的 `config` 是整体替换，不是深度合并。如果当前 profile 的 `connection` 行有自定义选项，请先将它们合并到本 Bundle patch 的 `config` 中，再安装；不要直接覆盖现有配置。其余未在该 patch 中列出的 Connection 选项会使用 DSH schema 默认值。

安装后，在 Bundle 配置中的 `dsh-remote-access` 行按需设置 `networkIds`、`remotePort` 和 `allowedClients`。通过修改当前 profile 配置或此 Bundle patch 配置，重启 DSH 使设置生效。

## 插件配置

在 `cordis.patch.yml` 的 `dsh-remote-access` 配置项中修改：

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `networkIds` | `[]` | 要监听的 ZeroTier Network ID 列表。空数组表示监听所有匹配的 ZeroTier 网卡；填入 ID 可只监听指定网络。 |
| `remotePort` | `3080` | 远端设备访问的 TCP 端口。若该地址和端口已被其他程序占用，监听会失败。 |
| `allowedClients` | `[]` | 可选的来源 IPv4 白名单。空数组表示该监听网络中的任意成员都可以连接到 DSH 登录页；填入设备的 ZeroTier Managed IP 可限制设备。 |
| `compatShim` | `true` | 是否向页面注入随包提供的 WebKit 兼容垫片。 |
| `maxConnections` | `64` | 单个监听地址允许的最大并发连接数。 |
| `retrySeconds` | `30` | ZeroTier 地址暂不可用时的重试间隔，最小 5 秒。 |

**面向所有 ZeroTier 设备的默认设置**是 `networkIds: []` 且 `allowedClients: []`。这表示所有本机 ZeroTier 网卡都可能建立监听，网内成员均可打开登录页。若主机加入了多个网络，建议填写指定 `networkIds`，避免不相关网络也能访问。不要把 ZeroTier Network ID 或 Managed IP 写进公开仓库；在本机部署配置中填写即可。

## 主机防火墙

插件只绑定 ZeroTier IPv4 地址，但主机防火墙仍需允许入站 TCP `remotePort`。建议只允许 ZeroTier 网卡/网络来源，不要创建对所有网络配置文件都开放的入站规则。

- **Windows**：在 Windows Defender Firewall 高级安全中创建入站 TCP 规则，端口设为插件的 `remotePort`，将规则限制到 ZeroTier 主机地址/网段及合适的网络配置文件。不要为公网或所有接口开放该端口。
- **macOS**：如果系统防火墙询问是否允许 DSH 所用的 Node/DSH 程序接收入站连接，只对可信 ZeroTier 网络放行；确认 ZeroTier 客户端显示已连接。
- **Linux**：在使用的防火墙中仅允许 ZeroTier 网段访问该端口。例如 UFW（将网段替换为 Central 配置的 Managed Route）：

```bash
sudo ufw allow from <ZEROTIER_CIDR> to any port 3080 proto tcp
```

不要照抄示例中的占位符。不同操作系统、防火墙与 ZeroTier 路由配置不同；修改前核实网段，并避免额外添加公网路由。

## 连通性检查

1. 在 ZeroTier Central 确认 DSH 主机和浏览设备均已授权，且各自显示 Managed IP。
2. 在 DSH 主机确认插件启动日志显示 `forwarding <ZeroTier-IP>:<port> to 127.0.0.1:<DSH-port>`。
3. 从另一台已加入同一网络的设备，在浏览器访问 `http://<DSH主机的ZeroTier-IP>:<remotePort>/`。
4. 到达 DSH 页面说明 TCP 转发正常；登录后再验证需要认证的功能。
5. 如无法连接，分别检查 ZeroTier 网络状态、Central 授权、主机防火墙、监听端口和 `networkIds` / `allowedClients` 配置。

Linux 可查看本机 ZeroTier 网络：

```bash
sudo zerotier-cli listnetworks
ip -4 addr
```

Windows 可在 ZeroTier One 托盘菜单查看网络/Managed IP，或在 PowerShell 运行 `ipconfig` 检查 ZeroTier 网卡地址。macOS 可在 ZeroTier 菜单栏应用查看网络状态，或运行 `ifconfig` 检查对应虚拟网卡。

## 安全与隐私

- 插件只绑定 ZeroTier IPv4 地址，不监听 `0.0.0.0`。
- `allowedClients` 是附加的网络访问限制，不替代 DSH 登录认证。
- 不要把 ZeroTier 网络暴露给不可信成员；获准加入私有网络的成员可能抵达 DSH 登录页。
- 插件不打印或持久化认证 URL、浏览器 token、Cookie，不创建运行时令牌文件。
- 发布包只包含 manifest、Cordis patch、入口代码、兼容垫片、README 和 MIT License；本机配置、密钥、日志、备份不属于发布内容。

## 卸载

在 DSH 插件管理器中移除该 Bundle，按提示重启 DSH。移除后会释放插件的监听端口并撤销页面垫片。若安装前合并过 `connection` 配置，卸载后按需恢复原配置；同时检查并清理主机上为本插件创建的防火墙规则。

## 开发与打包

```powershell
node --check lib/index.js
npm pack --dry-run
```

检查打包清单只包含预期的六个文件后，再发布归档。

## License

MIT，详见 [LICENSE](LICENSE)。
