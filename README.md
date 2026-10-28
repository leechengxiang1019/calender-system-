# Chronos 智能日历 — 网站原型

Chronos 是一个网页版智能日历。用户可以用一句中文或英文输入活动，系统会提取日期、时间、地点和优先级，
先让用户确认，再检查时间冲突并推荐空档。设计依据是《Chronos Design Philosophy Report v2》。

## 如何打开

**直接看成品：** 双击 `index.html`，用 Chrome 或 Edge 打开即可，不需要安装任何东西。
第一次打开会自动登录示例账号（`demo@chronos.app` / `chronos123`）并显示示例活动。

**用 Visual Studio Code 查看和修改代码：**
1. 打开 VS Code → File → Open Folder… → 选择 `chronos-project` 文件夹。
2. （建议）安装扩展 **Live Server**，在 `index.html` 上按右键 → *Open with Live Server*，存档后网页会自动刷新。

**用 Visual Studio 2022：** File → Open → Folder… → 选择 `chronos-project`，在 `index.html` 上按右键 → *View in Browser*。

## 文件结构

| 文件 | 内容 | 对应报告章节 |
|---|---|---|
| `index.html` | 页面结构：登录页、顶栏、输入框、侧栏、日历区、侧边面板 | 1.3 表示层 |
| `css/style.css` | 全部样式：颜色、字体、响应式布局、深色模式 | 1.2.8、1.5 |
| `js/utils.js` | DOM 小工具和浏览器储存（localStorage） | 1.2.9 |
| `js/i18n.js` | 所有界面文字的英文和中文版本，`t()` 取当前语言文字 | 1.6 可选功能：中文界面 |
| `js/datetime.js` | 日期／时间格式化（中英文）、时区、优先级定义 | 1.2.3、1.2.4 |
| `js/parser.js` | 规则式自然语言提取：`parseEn()` 英文、`parseZh()` 中文 | 1.2.1 |
| `js/scheduling.js` | 校验 `validate()`、冲突检测 `clashes()`、空档推荐 `findAlts()` | 1.2.2、1.2.4、1.4.2 |
| `js/email.js` | 电邮提醒：弹出提醒时，同时用 EmailJS 发一封电邮到登录用户的邮箱 | 1.2.3 |
| `js/app.js` | 账号登录／注册、示例数据、日／周／月／列表视图、活动表单、详情、提醒、使用说明、启动 | 1.2.5、1.2.7、1.4.1 |

JS 文件按顺序在 `index.html` 底部载入：EmailJS SDK → utils → i18n → datetime → parser → scheduling → email → app。

## 电邮提醒（EmailJS）

弹出提醒的同时，系统会发一封电邮到**登录用户注册时填的邮箱**。电邮内容和弹出提醒一样，所以优先级越高，内容越详细。
优先级为“无”或设定“不提醒”的活动不会发电邮。示例账号 `demo@chronos.app` 不是真实邮箱，不会发送。

设定步骤（只需做一次）：
1. 到 <https://www.emailjs.com> 注册免费账号。
2. **Email Services** → *Add New Service* → 选 Gmail，连接你的 Gmail → 记下 **Service ID**。
3. **Email Templates** → *Create New Template*：
   - **To Email** 填 `{{to_email}}`
   - **Subject** 填 `{{subject}}`
   - **Content** 例如：
     ```
     Hi {{to_name}},

     {{title}}（{{priority}}）
     {{when}}
     {{details}}

     — Chronos
     ```
   - 保存后记下 **Template ID**。
4. **Account** → **General** → 复制 **Public Key**。
5. 把三个值填进 `js/email.js` 顶部的 `EMAIL_CFG`。
6. 用你自己的邮箱注册一个 Chronos 账号，新增一个几分钟后开始的活动（优先级不要选“无”，提醒选“提前 10 分钟”），网页保持打开，等提醒弹出就会收到电邮。

如果直接双击 `index.html` 发送失败，改用 Live Server 打开（`http://127.0.0.1:5500`）。

## 核心规则（方便讲解）

- **冲突判断**：两个活动在同一天，且 `新开始 < 旧结束` 并且 `新结束 > 旧开始`，就算重叠。
  例：旧活动 1:00–4:00 PM，新活动 4:00 PM 开始不算冲突。
- **空档推荐**：在上午 8 点到晚上 10 点之间，每 30 分钟检查一次，找出同样时长且没有冲突的时段，
  先找同一天、再找之后 6 天，最多推荐 3 个。选择空档只会填入表单，不会自动修改日程。
- **不自行猜测**：缺日期、缺开始时间、“3点”不知上午还是下午、“明晚”没有具体时间时，系统会提问，不会自己填值。
- **优先级与提醒**：无／低／中／高／紧急 = 灰／蓝／绿／橙／红；优先级越高，提醒显示内容越详细；“无”不弹出提醒。

## 原型限制

- 账号和活动保存在浏览器的 localStorage 里（报告中的正式版本使用 Java 服务层 + 关系型数据库）。
- 密码在浏览器端加盐后用 SHA-256 哈希；正式版本应在服务器端用 BCrypt 等专用算法处理。
- 活动只支持单日（不跨午夜），暂不支持重复活动。
- 电邮提醒由浏览器发送，所以网页必须开着才会发；EmailJS 的 Public Key 会出现在前端代码里。正式版本应由 Java 服务层定时检查，再经 SMTP 发送，即使用户没开网页也能收到。
- 注册时没有验证邮箱是否属于本人。
