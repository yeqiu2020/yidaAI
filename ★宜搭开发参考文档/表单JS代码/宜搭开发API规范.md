> 作者：叶秋
> 联系方式：15270209736
> 来源：www.yidatrain.com

# 宜搭开发 API 规范

<!-- 在此添加宜搭开发相关的 API 规范和说明 --> 

概述
宜搭平台提供了非常丰富的开放 API 方案供开发者使用，针对不同的场景，开发者可以使用不同的开放 API 方案来实现业务诉求。不同的开放 API 的区别及适用场景如下所示：
● 宜搭 JS-API - 主要用于在宜搭设计器的动作面板或者变量绑定场景调用一些前端功能 API，例如字符串格式化、获取表单控件值等，具体使用详见宜搭 JS-API 文档;
● 跨应用数据源 API - 主要用于在宜搭设计器的远程 API 配置中使用，用于对宜搭的应用数据进行增删改查等操作，例如查询表单数据、流程发起等，具体使用详见跨应用数据源 API 文档;
● 钉钉 JS-API - 主要用于搭建产物在钉钉端内调用一些钉钉客户端提供的 JSAPI，例如原生弹框、获取设备信息等，具体使用详见钉钉 JS-API 文档;
● 服务端开放 API - 主要用于在服务端调用宜搭提供的开放 API，功能和跨应用数据源 API 基本一致，但主要用于服务端调用，因此增加了鉴权环节，具体使用详见服务端开放 API 文档;

宜搭 JS-API
本文档主要介绍宜搭平台在 JS 面板或变量绑定弹框中可以直接调用的 API 及其使用方法，每一个 API 都会配备一个示例用于展示 API 的具体使用方式，在示例中，我们都会通过以下函数结构来进行包裹用于模拟动作面板的真实使用场景（包裹的函数名称在真实环境下用户可以自由定义）。
export function someFunctionName() {  ...}

开始之前
以下 API 要求你具备一定的 JavaScript 基础知识，了解一些常见的数据类型、变量和函数的声明和使用，同时知道并能绕开一些常见的 JavaScript 陷阱。
以下面的 API 中常见的 this.state、this.setState、this.$() 为例，当 this 出现在事件函数的最外层时，this 会指向正确的执行上下文，从而能够很好的完成读取数据源、设置数据源以及获取其他表单数据：
export function setSomeValue() {  const status = this.state.status;  const newStatus = status + 1;  this.setState({ status: newStatus });  this.$('numberField_xxx').setValue(newStatus);}

但如果 this 出现在嵌套函数中，就需要注意 this 指向是否正确了：
export function setSomeValue(value) {  // 这里保存了一个 this 的引用  const that = this;  this.dataSourceMap.xxx.load(function (ret) {    // 错误 ！！！function 创建了新的上下文环境    // 这里的 this 已经改变，无法读取数据源或获取到其他字段    this.$('numberField_xxx').setValue(ret);    // 替代方案，使用外部保存的正确引用来替代    that.$('numberField_xxx').setValue(ret);  });  // 或者使用箭头函数避免 this 值改变  this.dataSourceMap.xxx.load((ret) => {    // 箭头函数不会创建一份新的上下文，this 也不会被改变    this.$('numberField_xxx').setValue(ret);  });}

推荐一些 JavaScript 入门指南：
● MDN 上的 JavaScript 入门
● JavaScript 参考 - 表达式和运算符 - this
● JavaScript Garden
● Stack Overflow
全局变量 API
宜搭的设计模式主要参考 React 的方案，因此我们提供全局变量来进行页面级状态管理并提供相应的 API 来触发页面的重新刷新（具体使用参考 全局变量文档）。
this.state.xxx
获取全局变量的值（和 React 的 API 一致）。
xxx 一般为页面数据源的变量名称。
示例：
export function getState() {  // 获取页面全局变量的值，并通过 console 打印出来  const status = this.state.status;  console.log( `status: ${status}` )}

this.setState()
设置全局变量的值并触发页面重新渲染（和 React 的 API 基本一致）。
注意：禁止使用 this.state.a = b 的方式修改变量的值，后续升级将不能保证兼容性，相关代码将不能正常运行。
示例：
export function setStateValue() {  // 设置页面全局变量的值并触发页面重新渲染  this.setState({    status: 'loading',    text: '加载中…'  });}

远程数据 API
宜搭支持配置远程数据源，并提供通过 js 触发远程数据源调用的 API（具体使用参考 远程 API 文档）。
this.dataSourceMap.xxx.load()
手动调用指定的远程 API，xxx 为在数据源面板设置的数据源名称，同时支持传入请求参数，API 调用传入的请求参数将于数据源配置中的请求参数进行 merge 并发送请求，load 方法返回一个 Promise。
示例：
export function fetchData() {   // 请求数据源中配置的 getDataList 远程 API，并传入 pageSize 和 page 参数，若请求成功在 console 中打印结果，若请求失败，弹框提醒  this.dataSourceMap.getDataList.load({    pageSize: 10,     page: this.state.currentPage  }).then((res) => {    if (res) {      console.log('fetchData', res);    }  }).catch((err) => {    this.utils.toast({      type: 'error',       title: '请求失败！'    })；  });}

this.reloadDataSource()
重新请求所有自动加载设置为 true 的远程 API，该方法也返回一个 Promise。
示例：
export function reload() {  // 重新请求所有初始请求，在请求成功后弹框提醒  this.reloadDataSource().then(res => {    this.utils.toast({      type: 'success',       title: '刷新成功！'    })；  });}

JS 调用 API
宜搭提供动作面板进行 JS 代码编写，动作面板中的函数除了变量绑定及动作绑定使用之外还支持函数间的相互调用。
this.methodName()
我们提供动作面板中 js 函数的相关调用方式，用户可以使用 this.xxx(), 调用动作面板中的其他函数，其中 xxx 为其他函数的名称。
示例：
export function hello(params) {  this.utils.toast({    title: `hello ${params}` ,     type: 'success'  })}export function onClickInvoke(){  const value = this.$('textField_k1u12o6l').getValue()  // 调用动作面板中的其他函数  this.hello(value)}

工具类相关 API
宜搭提供了很多内置的工具类函数，帮助用户更好地实现一些常用功能。
this.utils.dialog()
弹出对话框，效果如下图所示，用户需要手动关闭：

宜搭底层采用 fusion 组件进行实现，你可以配置所有 Dialog 组件的属性 文档地址，以下列出了常用属性：
参数
属性
默认值
说明
type
'alert', 'confirm', 'show'
'alert'
-
title
(String)
-
-
content
(String|ReactNode)
-
也可传入 HTML/JSX 实现复杂布局
hasMask
(Boolean)
true
是否有遮罩
footer
(Boolean)
true
是否有底部操作按钮
footerAlign
'left', 'center', 'right'
'right'
底部操作对齐方向
footerActions
['cancel', 'ok'], ['ok', 'cancel'], ['ok'], ['cancel']
-
底部操作类型和顺序
onOk
(Func)
-
点击确定的回调函数
onCancel
(Func)
-
点击取消的回调函数
示例：
export function popDialog(){  this.utils.dialog({    type: 'confirm',     title: 'title',     content: 'content', // 如需换行可传入 HTML/JSX 来实现    onOk: () => { },     onCancel: () => { },   });}// 支持手动关闭对话框export function closeDialog() {  // 接受 dialog 返回值，该值是一个对象  const dialog = this.utils.dialog({});  // 在合适的时机调用对象的 hide 方法关闭对话框  dialog.hide();}

this.utils.formatter()
常用的 formatter 函数用于进行事件、金额、手机号等 format。
示例：
export function format() {  // 格式化日期，输出值为：2022-01-29  const formatDate = this.utils.formatter('date', new Date(), 'YYYY-MM-DD');  // 格式化日期，输出值为：2022/01/29  const formatDate = this.utils.formatter('date', new Date(), 'YYYY/MM/DD');  // 格式化日期，输出值为：2022-01-29 13:01:02  const formatDate2 = this.utils.formatter('date', new Date(), 'YYYY-MM-DD HH:mm:ss');  // 格式化金额，输出值为：10, 000.99  const formatMoney = this.utils.formatter('money', '10000.99', ', ');    // 格式化电话，输出值为：+86 1565 2988 282  const formatPhoneNumber = this.utils.formatter('cnmobile', '+8615652988282');  // 格式化银行卡号，输出值为：1565 2988 2821 2233  const formatCardNumber = this.utils.formatter('card', '1565298828212233');}

this.utils.getDateTimeRange(when, type)
获取当前或指定日期的开始结束区间时间戳。
when 和 type 都可选，默认返回当天的开始结束区间，可以指定日期和区间类型。
参数
属性
默认值
说明
when
支持时间戳、Date 日期类型
当前时间 new Date()
指定日期
type
'year', 'month', 'week', 'day', 'date', 'hour', 'minute', 'second'
'day'
获取的区间类型
示例：
export function search() {  const [dayStart, dayEnd] = this.utils.getDateTimeRange();  console.log( `dayStart: ${dayStart}, dayEnd: ${dayEnd}` );  // 输出当天的开始结束时间戳  const [monthStart, monthEnd] = this.utils.getDateTimeRange(new Date(), 'month');  console.log( `monthStart: ${monthStart}, dayEnd: ${monthEnd}` );  // 输出当月的开始结束时间戳}

this.utils.getLocale()
获取当前页面的语言环境。
示例：
export function locale() {  const locale = this.utils.getLocale();  console.log( `locale: ${locale}` );  // 输出：locale: zh_CN}

this.utils.getLoginUserId()
获取登录用户 ID。
示例：
export function getUserInfo() {  const userId = this.utils.getLoginUserId();  console.log( `userId: ${userId}` );  // 输出：userId: 43314767738888}

this.utils.getLoginUserName()
获取登录用户名称。
示例：
export function getUserInfo() {  const userName = this.utils.getLoginUserName();  console.log( `userName: ${userName}` );  // 输出：userName: 韩火火}

this.utils.isMobile()
判断当前访问环境是否是移动端。
示例：
export function someFunctionName() {  console.log('isMobile', this.utils.isMobile());}

this.utils.isSubmissionPage()
判断当前页面是否是数据提交页面。
示例：
export function someFunctionName() {  console.log('isSubmissionPage', this.utils.isSubmissionPage());}

this.utils.isViewPage()
判断当前页面是否是数据查看页面。
示例：
export function someFunctionName() {  console.log('isViewPage', this.utils.isViewPage());}

this.utils.loadScript()
动态加载远程脚本。
示例：
export function didMount() {  this.utils.loadScript('https://g.alicdn.com/code/lib/qrcodejs/1.0.0/qrcode.min.js').then(() => {    var qrcode = new QRCode(document.getElementById('qrcode'), {      text: "http://jindo.dev.naver.com/collie",      width: 128,      height: 128,      colorDark : "#000000",      colorLight : "#ffffff",      correctLevel : QRCode.CorrectLevel.H    });  });}

this.utils.openPage()
打开新页面。
如果在钉钉环境下，会使用钉钉 API 打开新页面，体验会更友好一些。
示例：
export function someFunctionName() {  this.utils.openPage('/workbench');}

this.utils.previewImage()
图片预览，通过这个 API 我们可以实现一个简洁的图片预览效果，如下所示： 
示例：
export function previewImg() {  this.utils.previewImage({ current: 'https://img.alicdn.com/tfs/TB1JUnZ2GL7gK0jSZFBXXXZZpXa-260-192.png_.webp' });}

this.utils.toast()
信息提醒，会比 Dialog 对话框更加轻量，弹出后过一段时间会自动消失，效果如下图所示：

参数配置：
参数
属性
默认值
说明
type
'success', 'warning', 'error', 'notice', 'help', 'loading'
'notice'
-
title
(String)
-
-
size
'medium', 'large'
'medium'
-
duration
(Number)
-
type 为 loding 时无效
示例：
export function popToast(){  this.utils.toast({    title: 'success',     type: 'success',     size: 'large',   })}// 支持手动调用关闭方法export function showLoadingToast() {  // 拿到返回值，该返回值是一个关闭方法  const close = this.utils.toast({    title: '加载中',     type: 'loading',     size: 'large',   });    // 在合适的时候调用关闭方法  setTimeout(close, 3000);}

路由相关 API
宜搭提供获取路由信息及页面跳转相关 API，底层实现主要使用 react-router，因此跳转 API 与 react-routerAPI 基本一致，另外宜搭还提供了一些路由相关的扩展 API。
this.utils.router.push()
页面跳转并且会将跳转记录 push 到路由堆栈中，可以通过浏览器的回退按钮进行回退，push 的参数描述如下所示：
function push(path: string, params?: object, blank?: boolean, isUrl?: boolean, type?: string) => void;

参数名
类型
必填
说明
path
string
是
跳转的地址，可以是完整的 url，url 片段，也可以是 pageID 构成的字符串, 如果有 slug，优先使用 slug（页面别名，宜搭暂未开放配置） 跳转。
当 isUrl 参数为 true 的时候会按照 url 的方式解析，否则会以 pageId 的形式解析实现内部页面之间的跳转。
params
object
否
跳转地址所带的查询参数 {q: 'a', r: 'b'} 等效于 ?q=a&r=b
blank
boolean
否
是否新打开页面，默认值为 false
isUrl
boolean
否
是否是 url 地址，默认值为 false
type
string
否
可选值为 push 或 replace，使用 push 的方式或 replace 的方式跳转
示例：
export function pushUrl() {  // 跳转页面，且注入 fromSource 参数，最终眺往的地址为：https://www.aliwork.com?formSource=customPage  this.utils.router.push('https://www.aliwork.com', {fromSource: 'customPage'});}

this.utils.router.replace()
页面替换，与 router.push 的区别是该 API 会替换当前页面而不是进入下一个页面，因此无法通过浏览器的返回按钮进行退回，等价于：
this.utils.router.push(path, params, false, false, 'replace');

示例：
export function replaceUrl() {  // 跳转页面，且注入 fromSource 参数  this.utils.router.replace('https://www.aliwork.com', {fromSource: 'customPage'});}

this.utils.router.getQuery()
获取页面 URL 参数，若传入 key 参数则返回定义的参数值，否则返回 URL 的所有参数，getQuery 的参数描述如下：
function getQuery(key?: string, queryStr?: string) => Record<string, string> | string | undefined;

参数名
类型
必填
说明
key
string
否
传入 key 返回对应的值，否则返回整个对象
queryStr
string
否
默认值：location.search + location.hash, hash 覆盖 search；支持自定义字符串解析，格式为 '?a=1&b=2'
示例：
export function getQuery() {  // 获取 URL 中 fromSource 参数  const fromSource = this.utils.router.getQuery('fromSource');  console.log( `fromSource: ${fromSource}` );}

this.utils.router.stringifyQuery()
序列化 URL 参数，即将对象转换成 URL 参数形式。
示例：
export function stringifyQuery() {  // 将对象序列化为 URL 参数形式，并通过 console 打印  const params = {    name: 'yida',     gender: 'm'  };  const urlStr = this.utils.router.stringifyQuery(params);  console.log( `urlParams: ${urlStr}` );  // 输出结果为：urlParams: name=yida&gender='m'}

组件通用 API
在讲解组件相关的 API 之前需要提前介绍几个概念：
● 组件唯一标识（fieldId）- 宜搭会为每个组件设置一个唯一标识，用于识别组件实例，组件唯一标识可以通过组件属性面板进行查看；
● 组件属性（prop）- 在宜搭中每个组件都可以通过设置组件属性来实现不同功能（类似 React 的 props），我们可以通过 hover 组件属性面板查看配置项对应的属性名称；

组件通用 API 对于宜搭提供的所有组件都可以使用，主要用于读取或者设置组件的属性。
this.$(fieldId).get(prop)
通过 fieldId 找到组件并获取组件的属性值，fieldId 为组件标识，prop 为组件的属性名称。
注意：禁止使用 this.$(fieldId).xxx 的方式读取属性值，后续升级将不能保证兼容性，相关代码将不能正常运行。
示例：
export function getAttribute(){  // 获取文本组件的内容（content）属性，并在 console 中打印出来  const content = this.$('text_kyz78exo').get('content')  console.log( `text content: ${content}` );}

this.$(fieldId).set(prop, value)
通过 fieldId 找到组件并设置组件的属性值，fieldId 为组件标识，prop 为组件属性名称，value 为要设置的属性值。
注意：禁止使用 this.$(fieldId).xxx = xxx 的方式设置属性值，后续升级将不能保证兼容性，相关代码将不能正常运行。
示例：
export function setAttribute(){  // 设置文本组件的最大行数（maxLine）属性  this.$('text_kyz78exo').set('maxLine', 5);}

表单组件 API
表单组件是宜搭平台中最重要的一类组件，我们通常通过表单组件来收集数据，例如：输入框、单选、多选、下拉选择等，本部分将主要介绍表单组件相关的 API：
this.$(fieldId)
获取组件实例，fieldId 为组件唯一标识，在调用组件 API 之前，通常我们需要通过 this.$(fieldId) 先获取组件实例再进行 API 调用。
注意：禁止使用 this.$(fieldId).xxx 的方式获取一些不在文档中说明的 API 和属性来使用，文档中未注明的 API 和属性为私有内部实现，后续升级将不能保证兼容性，相关代码将不能正常运行。
this.$(fieldId).getValue()
获取指定表单组件的输入值。
示例：
export function getValue(){  // 获取输入框组件的用户输入值，并在 console 中打印出来  const value = this.$('textField_kyz78exp').getValue();  console.log( `input value: ${value}` );}

this.$(fieldId).setValue()
设置指定表单组件的输入值，setValue 的参数描述如下所示：
interface IOptions {  doNotValidate: boolean; // 是否阻止自动校验，默认为 false  formatted: boolean; // 是否已经格式化 默认为 false  triggerChange: boolean; // 是否触发组件值变化事件，默认为 true};/** * @param {any} value  需要设置的表单值 * @param {IOptions} [options] 配置项，可选 */function setValue(value: any, options?: IOptions) => void;

示例：
export function setValue(){  // 将输入框组件的值设置为「hello world」   this.$('textField_kyz78exp').setValue('hello world');}

// --- 实践补充：关于子表单 (TableField) 的动态更新 ---
/**
 * 特别注意：对于子表单 (TableField) 组件，直接调用 .addItem() 或 .addSubTableLine() 方法在前端 JS 中添加行数据可能会失败 (如本次调试过程所示，会报 xxx is not a function 错误)。
 *
 * 正确且推荐的方式是：
 * 1. 准备一个包含所有目标行数据的完整 JavaScript 数组 (Array)。数组中每个元素是一个对象，代表一行数据，对象的 key 是子表内组件的 fieldId，value 是对应的值。
 * 2. 调用子表单控件实例的 .setValue() 方法，将这个完整的数组一次性设置给子表单。
 *
 * 示例：假设有一个子表单 tableField_abc，内部有 textField_xyz 和 numberField_123 两列。
 */
/*
export function updateSubTable() {
  const subTable = this.$('tableField_abc');
  if (!subTable) return;

  // 准备新的完整数据
  const newData = [
    { textField_xyz: '第一行文本', numberField_123: 10 },
    { textField_xyz: '第二行文本', numberField_123: 25 }
    // ... 更多行
  ];

  // 使用 setValue 一次性更新
  subTable.setValue(newData);

  // 如果要清空子表，也使用 setValue
  // subTable.setValue([]);
}
*/
// --- 实践补充结束 ---

this.$(fieldId).reset()
重置指定表单组件的输入值，reset 的参数描述如下所示：
/** * @param {boolean} toDefault 是否重置为表单组件的默认值，默认为 true */function reset(toDefault?: boolean) => void;

示例：
export function reset() {  // 重置输入框组件的值   this.$('textField_kyz78exp').reset();}

this.$(fieldId).getBehavior()
获取指定表单组件的当前状态，表单组件的状态有以下可选值：
● NORMAL - 正常态，即输入态；
● READONLY - 只读态；
● DISABLED - 禁用态；
● HIDDEN - 隐藏态；
示例：
export function getBehavior() {  // 获取输入框组件的状态，并将其打印出来  const behavior = this.$('textField_kyz78exp').getBehavior();  console.log( `text behavior: ${behavior}` );}

this.$(fieldId).setBehavior()
设置指定表单组件的状态，可以设置的状态可以参考 getBehavior 部分的描述。
示例：
export function setBehavior() {  // 将输入框组件的状态设置为禁用（DISABLED）状态  this.$('textField_kyz78exp').setBehavior('DISABLED');}

this.$(fieldId).resetBehavior()
重置指定表单组件的状态。
示例：
export function resetBehavior() {  // 重置输入框组件的状态  this.$('textField_kyz78exp').resetBehavior();}

this.$(fieldId).validate()
执行一次指定表单组件的校验，validate 的参数描述如下所示：
/** * @param {Array|null} errors 错误信息，如果没有错误则为 null * @param {Object} values 表单组件的值 */function ValidateCallback(errors: string[] | null, values: object | null) => void/** * @param {Function} callback 校验的回调方法，可选 */function validate(callback?: ValidateCallback) => void;

示例：
export function validate() {  // 执行输入框组件的校验，如果校验失败则在 console 中打印 errors 和 values  this.$('textField_kyz78exp').validate((errors, values) => {    console.log(JSON.stringify({errors, values}, null, 2));  });}

当一个输入框的校验规则为手机号时，如果校验失败，会打印出以下结构：
{  "errors": {    "textField_kyz78exp": {      "errors": [        "输入框不是一个合法的手机号码格式"      ]    }  },   "values": {    "textField_kyz78exp": "33"  }}

this.$(fieldId).disableValid()
关掉表单组件的校验。
示例：
export function disableValid() {  this.$('textField_kyz78exp').disableValid();}

this.$(fieldId).enableValid()
开启表单组件的校验，enableValid 的参数描述如下所示：
/** * @param {boolean} doValidate 是否马上执行校验，可选，默认为 false */function enableValid(doValidate?: boolean) => void;

示例：
export function enableValid() {  // 开启输入组件的校验，并立即执行  this.$('textField_kyz78exp').enableValid(true);}

this.$(fieldId).setValidation()
设置表单组件的校验规则，setValidation 的参数描述如下所示：
interface IRule {  type: string; // 校验类型  param: any; // 校验类型对应的参数  message: string; // 错误信息}/** * @param {IRule[]} rules 校验规则，必填 * @param {boolean} [doValidate] 是否马上执行校验，可选，默认为 false */function setValidation(rules: IRule[], doValidate?: boolean) => void;

宜搭支持的校验类型如下所示：
支持校验的规则
属性
必填
{"type": "required"}
最小长度
{"type": "minLength", "param": "23" }
最大长度
{"type": "maxLength", "param": "23" }
邮箱
{"type": "email"}
手机
{"type": "mobile"}
网址
{"type": "url"}
最小值
{"type": "minValue", "param": "3"}
最大值
{"type": "maxValue", "param": "3"}
自定义函数
{"type": "customValidate", "param": (value, rule) => { return ture; }}
示例：
export function setValidation() {  // 设置输入组件的校验规则，必填、最大长度为 10 且  this.$('textField_kyz78exp').setValidation([{    type: 'required'  }, {    type: 'maxLength',     param: '10'  }, {    type: 'customValidate',     param: (value, rule) => {      if(/^\d*$/.test(value)) {        return true;      }      return rule.message;    },     message: '只能输入数字'  }]);}

this.$(fieldId).resetValidation()
重置表单组件的校验规则，即在 setValidation 后用于恢复之前的校验规则，resetValidation 的参数如下所示：
/** * @param {boolean} [doValidate] 是否马上执行校验，可选，默认为 false */function resetValidation(doValidate?: boolean) => void;

示例：
export function resetValiation() {  // 重置输入框组件的校验规则，并立即校验  this.$('textField_kyz78exp').resetValidation(true);}

// --- 新增内容开始 ---

this.$('容器组件ID').setFieldProp('内部组件ID', propName, value)
(实验性 API，基于实践发现对 TableField 有效)
设置容器组件（如 TableField 子表单）内部指定组件的属性值。

*   **容器组件ID:** 容器组件自身的 fieldId (例如: 子表单的 fieldId)。
*   **内部组件ID:** 容器内部目标组件的 fieldId (例如: 子表单内某一列对应的输入框 fieldId)。
*   **propName:** 要设置的属性名称 (例如: `'behavior'` 用于控制显隐/只读状态)。
*   **value:** 要设置的属性值 (例如: `'HIDDEN'`, `'READONLY'`, `'NORMAL'`)。

**特别说明:** 此方法在当前文档版本中未明确列出，但实践证明对于 `TableField` 组件设置其内部组件的 `behavior` 属性是有效的，可用于动态控制子表单列的显隐或只读状态。

**示例 (隐藏子表单 TableField_xxx 内的 textField_yyy 列):**
export function hideTableColumn() {
  const tableField = this.$('TableField_xxx');
  if (tableField) {
    tableField.setFieldProp('textField_yyy', 'behavior', 'HIDDEN');
  }
}

// --- 新增内容结束 ---

Dialog 组件 API
宜搭提供了一个对话框组件用于展示对话框形式的内容展示，同时提供了一些 API 来操作对话框的行为。
this.$(fieldId).show()
显示指定对话框，该 API 提供一个 callback 函数能够在对话框展示后回调。
示例：
export function openDialog() {  this.$('dialog_kyz78exr').show(() => {    console.log('Dialog is open');  });}

this.$(fieldId).hide()
关闭指定对话框。
示例：
export function closeDialog() {  this.$('dialog_kyz78exr').hide();}



跨应用数据源API
宜搭提供远程 API 调用的能力可以通过 HTTP 请求异步接口（详细使用请参考 远程 API 文档），于此同时宜搭平台还提供了一些内置的远程 API 用于进行宜搭数据的操作。
警告
由于宜搭提供的 Open API 调用需要进行鉴权，因此在免登页面中无法直接使用远程 Open API，可以自行通过 FaaS 或者自建服务中转调用。
API 调用说明
请求路径
宜搭提供多种应用维度的接口，在应用内可以通过以下方式来调用远程 API（支持跨应用调用），接口返回格式为：
# 应用编码可以通过应用设置=》部署运维页面进行查看# 接口路径参考下面的文档，不同 API 提供不同的接口路径"/dingtalk/web/${应用编码}/${接口路径}"

提示
在宜搭平台编写的接口请求代码请直接使用相对路径，如下所示，避免因企业二级域名修改导致需要调整代码。
/dingtalk/web/APP_X1X2X3X4/v1/form/searchFormDatas.json


接口返回结构
宜搭平台提供的远程 API 的返回结构如下所示：
interface IResponse {  success: boolean; // 请求是否成功  result?: object | array | string; // 请求成功的返回内容  errorMsg?: string; // 错误信息  errorCode?: string; // 错误码  errorLevel?: number; // 错误级别}

表单相关 API
宜搭平台提供表单类型的页面来进行表单数据收集，表单相关 API 则用来对表单数据进行相应的增删改查操作，下面提到的表单实例其实就是值表单数据集中的一条数据。
新建表单实例
● 接口路径： /v1/form/saveFormData.json
● 请求类型： POST
● 参数：( formDataJson 需要通过 JSON.stringify() 函数来把对象进行序列化)
参数名
描述
是否必填
示例
备注
formUuid
表单 ID
是
FORM-NJYJZELV8YZRDEI2N5IQ7L6VEDMR1VE9GMPCJB

appType
应用 ID
是
APP_DR4OK27ZKL5N22B907E8

formDataJson
表单数据
是
{"textField_jcpm6agt": "单行", "employeeField_jcos0sar": ["workno"]}
参考：附录 1 保存/更新 表单数据格式说明
● 返回值示例：
{  "result": "FINST-EF6Y93URN2UZ1SBPLIP9NAV6HR2GEO1Z4ZCHSCJ0",  "success": true}

更新表单中指定组件值
● 接口： /v1/form/updateFormData.json
● 请求类型： POST
● 参数：
参数名
描述
是否必填
示例
备注
formInstId
要更新的表单数据 ID
是
FINST-NJYJZELVVYZRVGJHR7M6FJW3ESJN1P1TCNPCJ9

updateFormDataJson
要更新的表单组件值，必填
是
{"employeeField_jcpm5gy2": ["xxxxx", "yyyyy"]}
参考：附录 1 保存/更新 表单数据格式说明。 参数有的组件更新，没有的组件保持不变。 明细的值只能统一更新，无法只更新子表单下某个组件的值
useLatestVersion
使用最新的表单版本进行更新
否
y
参考：附录 1 保存/更新 表单数据格式说明「特别注意」
● 返回值示例：
{  "success": true}

删除表单实例
● 接口： /v1/form/deleteFormData.json
● 请求类型： POST
● 参数：
参数名
描述
是否必填
示例
备注
formInstId
要删除的表单数据 ID
是
FINST-NJYJZELVVYZRVGJHR7M6FJW3ESJN1P1TCNPCJ9

● 返回值示例：
{  "success": true}

根据表单实例 ID 查询表单实例详情
● 接口： /v1/form/getFormDataById.json
● 请求类型： GET
● 参数：
参数名
描述
是否必填
示例
备注
formInstId
要查询的表单数据 ID
是
FINST-NJYJZELVVYZRVGJHR7M6FJW3ESJN1P1TCNPCJ9

● 返回值示例：
{  "success": "请求是否成功",  "errorMsg": "错误信息",  "errorCode": "错误码",  "result": "表单实例详情👇🏻👇🏻👇🏻"}

result 参见附录 5. 表单实例详情对象格式说明
根据条件搜索表单实例 ID 列表
● 接口： /v1/form/searchFormDataIds.json
● 请求类型： GET
● 参数：
参数名
描述
是否必填
示例
备注
formUuid
表单 ID
是
FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3

searchFieldJson
根据表单内组件值查询
否

格式见附录 2：根据组件值进行条件搜索，组件值格式说明
currentPage
当前页
否
1
必须大于 0 默认 1
pageSize
每页记录数
否
10
必须大于 0 默认 10 不能大于 100
originatorId
根据数据提交人工号查询
否


createFrom
createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式
createTo
createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式。和 createFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 创建的数据。
modifiedFrom
modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式
modifiedTo
modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表。
否
2018-02-01
字符串格式，且为 yyyy-MM-DD 格式。和 modifiedFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 被修改的数据。
dynamicOrder
排序
否
column: '+'
column: '+'
● 返回值示例：
{  "result": {    "data": ["FINST-EF6Y93URN2F02S745LTMW2D2G4WVDS16O17ISCJ0"],    "totalCount": 1,    "currentPage": 1  },  "success": true}

根据条件搜索表单实例详情列表
● 接口： /v1/form/searchFormDatas.json
● 请求类型： GET
● 权限控制：该接口会受页面设置的权限控制（管理员除外）
● 参数：
参数名
描述
是否必填
示例
备注
formUuid
表单 ID
是
FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3

searchFieldJson
根据表单内组件值查询
否

格式见附录 2：根据组件值进行条件搜索，组件值格式说明
currentPage
当前页
否
1
必须大于 0 默认 1
pageSize
每页记录数
否
10
必须大于 0 默认 10 不能大于 100
originatorId
根据数据提交人工号查询
否


createFrom
createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式（或者精确到秒 yyyy-MM-DD HH:mm:ss）
createTo
createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式（或者精确到秒 yyyy-MM-DD HH:mm:ss）和 createFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 创建的据
modifiedFrom
modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式（或者精确到秒 yyyy-MM-DD HH:mm:ss）｜
modifiedTo
modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表。
否
2018-02-01
字符串格式，且为 yyyy-MM-DD 格式。 （或者精确到秒 yyyy-MM-DD HH:mm:ss）和 modifiedFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 被修改的数据。
dynamicOrder
排序
否
{"numberField_1ac":"+"}
表示按照字段 numberField_1ac 升序排列
● 返回值示例：
{  "success": true,  "errorCode": "",  "errorMsg": "",  "result": {    "data": [],    "totalCount": 1,    "currentPage": 1  }}

获取表单定义
本接口将于2024年12月1日进行升级，升级后的接口将不再支持普通用户使用，只有管理员才支持调用。
● 接口： /v1/form/getFormComponentDefinationList.json
● 请求类型： GET
● 参数：
参数名
描述
是否必填
示例
备注
formUuid
表单 ID
是
FORM-NJYJZELV8YZRDEI2N5IQ7L6VEDMR1VE9GMPCJB

version
表单版本
否
FINST-NJYJZELVVYZRVGJHR7M6FJW3ESJN1P1TCNPCJ9
可以传入 formData 中的 version 字段。
为空时返回最新的版本定义




● 返回值示例：
{    "success":true,    "content":[        {            "label":"{"en_US":"CheckBox Field", "zh_CN":"多选", "type":"i18n"}",            "key":"checkboxField_jiwvhkdi"        },        {            "label":"{"en_US":"Textarea Field", "zh_CN":"多行输入框", "type":"i18n"}",            "key":"textareaField_jiwvhkdh"        },        {            "label":"{"en_US":"Select Field", "zh_CN":"下拉单选", "type":"i18n"}",            "key":"selectField_jiwvhkdg"        }    ]}

获取子表单数据
● 接口： v1/form/listTableDataByFormInstIdAndTableId.json
● 请求类型： GET
● 参数：
参数名
描述
是否必填
示例
备注
formUuid
表单 ID
是
FORM-NJYJZELV8YZRDEI2N5IQ7L6VEDMR1VE9GMPCJB

formInstanceId
要查询的实例的实例 ID
是
FINST-NJYJZELVVYZRVGJHR7M6FJW3ESJN1P1TCNPCJ9

tableFieldId
需要查找的子表单组件的唯一标识
是
tableField_ksyaujq1

currentPage
当前页
否
10
必须大于 0，默认 1
pageSize
每页记录数
否
50
大于 0 并且小于 50，默认 10
● 返回值示例：
{  "result": {    "data": [      {        "textField_kstqokaa": ""      },      {        "textField_kstqokaa": "1"      },      {        "textField_kstqokaa": "2"      }    ],    "totalCount": 120,    "currentPage": 1  },  "success": true}

流程相关 API
流程表单也是宜搭平台提供的基础能力之一，流程相关 API 用于对流程进行相关操作。
流程发起
● 接口路径： /v1/process/startInstance.json
● 请求类型： POST
● 参数：
参数名
描述
是否必填
示例
备注
processCode
流程 code
是
TPROC--EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ4 ｜ 单独发起页链接上可查

formUuid
表单 ID
是
FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3 ｜ 单独发起页链接上可查

formDataJson
表单数据
是

参考：附录 1 保存/更新 表单数据格式说明
deptId
发起人所在部门号
否
18295
不填，默认发起人主职部门
● 返回值示例：
{  "result": "f30233fb-72e1-4af4-8cb8-c7e0ea9ee530",  "success": true}

根据条件搜索流程实例 ID
● 接口路径： /v1/process/getInstanceIds.json
● 请求类型： GET
● 权限说明：流程需要配置实例可查看权限（管理员除外）
● 参数：
参数名
描述
是否必填
示例
备注
formUuid
表单 ID
是
FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3

searchFieldJson
根据表单内组件值查询
否

格式见附录 2：根据组件值进行条件搜索，组件值格式说明
taskId
任务 ID
否
2199132092
一般用不到
instanceStatus
实例状态
否
RUNNING
可选值为：RUNNING, TERMINATED, COMPLETED, ERROR。分别代表：运行中，已终止，已完成，异常。
approvedResult
流程审批结果
否
agree
可选值为：agree, disagree。分别表示：同意， 拒绝。
currentPage
当前页
否
1
必须大于 0，默认 1
pageSize
每页记录数
否
10
必须大于 0 默认 10 不能大于 100
originatorId
根据流程发起人工号查询
否


createFrom
createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式 yyyy-MM-DD
createTo
createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表。
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式。和 createFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 创建的数据。
modifiedFrom
modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式
modifiedTo
modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表。
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式。 和 modifiedFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 被修改的数据。
● 返回值示例：
{  "result": {    "data": [      "f30233fb-72e1-4af4-8cb8-c7e0ea9ee530",      "bc0950a3-fe1b-459c-b6ba-282be38523ab",      "f540cbd7-43eb-40de-b915-6716578a2802"    ],    "totalCount": 3,    "currentPage": 1  },  "success": true}

根据搜索条件获取实例详情列表
● 接口路径： /v1/process/getInstances.json
● 请求类型： GET
● 权限说明：流程需要配置实例可查看权限（管理员除外）
● 参数：
参数名
描述
是否必填
示例
备注
formUuid
表单 ID
是
FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3

searchFieldJson
根据表单内组件值查询
否

格式见附录 2：根据组件值进行条件搜索，组件值格式说明
taskId
任务 ID
否
2199132092
一般用不到
instanceStatus
实例状态
否
RUNNING
可选值为：RUNNING, TERMINATED, COMPLETED, ERROR。
分别代表：运行中，已终止，已完成，异常。




approvedResult
流程审批结果
否
agree
可选值为：agree, disagree。分别表示：同意， 拒绝。
currentPage
当前页
否
1
必须大于 0，默认 1
pageSize
每页记录数
否
10
必须大于 0 默认 10 不能大于 100
originatorId
根据流程发起人工号查询
否


createFrom
createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式 yyyy-MM-DD
createTo
createFrom 和 createTo 两个时间构造一个时间段。查询在该时间段创建的数据列表。
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式。和 createFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 创建的数据。
modifiedFrom
modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式
modifiedTo
modifiedFrom 和 modifiedTo 构成一个时间段，查询在该时间段有修改的数据列表。
否
2018-01-01
字符串格式，且为 yyyy-MM-DD 格式。 和 modifiedFrom 一起，相当于查询在 2018-01-01 到 2018-01-31 之间 (包含 01 和 31 号) 被修改的数据。
● 返回值示例：
{  "success": true,  "errorCode": "",  "errorMsg": "",  "result": {    "data": [],    "totalCount": 1,    "currentPage": 1  }}

根据实例 ID 获取流程实例详情
● 接口路径： /v1/process/getInstanceById.json
● 请求类型： GET
● 参数：
参数名
描述
是否必填
示例
备注
processInstanceId
流程实例 ID
是
f30233fb-72e1-4af4-8cb8-c7e0ea9ee530

● 返回值示例：
{  "success": true,  "errorCode": "",  "errorMsg": "",  "result": "实例详情，参见 [附录 3- 流程实例详情对象格式说明](#流程实例详情对象格式说明)"}

删除流程实例
● 接口路径： /v1/process/deleteInstance.json
● 请求类型： POST
● 参数：
参数名
描述
是否必填
示例
备注
processInstanceId
流程实例 ID
是
f30233fb-72e1-4af4-8cb8-c7e0ea9ee530

● 返回值示例：
{  "success": true,  "errorCode": "",  "errorMsg": ""}

终止流程实例
● 接口路径： /v1/process/terminateInstance.json
● 请求类型： POST
● 参数：
参数名
描述
是否必填
示例
备注
processInstanceId
流程实例 ID
是
f30233fb-72e1-4af4-8cb8-c7e0ea9ee530

● 返回值示例：
{  "success": true,  "errorCode": "",  "errorMsg": ""}

执行单个任务接口
● 接口路径： /v1/task/executeTask.json
● 请求类型： POST
● 参数：
参数名
描述
是否必填
示例
备注
taskId
任务 ID
是
12002575

procInstId
实例 ID
是
f30233fb-72e1-4af4-8cb8-c7e0ea9ee530

outResult
审批结果
是
AGREE
AGREE(同意)、DISAGREE(不同意)
remark
审批意见
是
确认同意

formDataJson
审批意见
否
确认同意
参考：附录 1 保存/更新 表单数据格式说明。
参数有的组件更新，没有的组件保持不变。明细的值只能统一更新，无法只更新子表单下某个组件的值




noExecuteExpressions
是否不执行校验&关联操作
否
y
本任务节点有绑定校验规则或者关联操作时，
y -> 不执行校验规则&关联操作 n -> 执行校验规则&关联操作不传默认为 n，即会执行校验规则&关联操作




● 返回值示例：
{  "success": "请求是否成功",  "errorCode": "错误信息",  "errorMsg": "错误码"}

获取审批记录
● 接口路径： /v1/process/getOperationRecords.json
● 请求类型： GET
● 参数：
参数名
描述
是否必填
示例
备注
processInstanceId
流程实例 ID
是
f30233fb-72e1-4af4-8cb8-c7e0ea9ee530

● 返回值示例：
{  "success": true,  "content": [    {      "operateTime": "2018-06-22 14:35:40",      "remark": "",      "taskHoldTime": 0,      "type": "HISTORY",      "operatorName": "宜小搭",      "operator": "yida",      "activityId": "sid-restartevent",      "action": "提交申请",      "actionExt": "submit",      "id": 2846866118,      "operatorPhotoUrl": "/photo/yida.128x128.jpg",      "processInstanceId": "8c124808-82e7-473b-9a7a-43c29b310837",      "showName": "提交申请",      "operateType": "NEW_PROCESS",      "domains": [],      "operatorStatus": "A",      "operatorAgentIds": [],      "size": 1,      "operatorDisplayName": "宜小搭",      "taskId": "null"    },    {      "taskHoldTime": 531398377,      "type": "TODO",      "operatorName": "宜小搭",      "operator": "yida",      "activityId": "sidJIOB2P2J1JW3RPMDOS28",      "taskType": "COMMON_ALL_AT_ONCE",      "actionExt": "doing",      "operatorPhotoUrl": "/photo/yida.128x128.jpg",      "processInstanceId": "8c124808-82e7-473b-9a7a-43c29b310837",      "showName": "执行人",      "activeTime": "2018-06-22 14:35:41",      "domains": [],      "operatorStatus": "A",      "operatorAgentIds": [],      "size": 1,      "operatorDisplayName": "宜小搭",      "taskId": "2846866145"    }  ]}

流程实例更新
● 接口路径： /v1/process/updateInstance.json
● 请求类型： POST
● 参数：
参数名
描述
是否必填
示例
备注
processInstanceId
实例 ID
是


updateFormDataJson
更新的表单数据
是

参考：附录 1 保存/更新 表单数据格式说明
● 返回值示例：
{  "success": true}

任务中心相关 API
宜搭平台提供有一个任务中心用来查看当前组织下所有应用的任务列表及其状态，任务中心相关 API 则是用来对任务中心中的任务列表进行查询操作。
已提交任务
● 接口路径： /v1/process/getMySubmitInApp.json
● 请求类型： GET
● 参数：
参数名
描述
是否必填
示例
备注
pageSize
每页记录数
是
10
必须大于 0 默认 10 最大值：100
currentPage
当前页
是
1
必须大于 0 默认 1
keyword
关键词
否


● 返回值示例：
    ○ 成功
{  "result": {    "data": [      {        "modifiedTime": "2018-04-12 19:44:14",        "formInstanceId": "FINST-AJ1L4CJVXL0UIAIPR06ZA52U9HKUXXXXXX",        "title": "单据",        "instValue": [          {            "componentId": "node_jfwgghbo",            "componentName": "TextField",            "fieldId": "textField_jfwggg8e",            "label": "姓名",            "validation": [],            "fieldData": {              "complexType": "custom",              "dataType": "CHANGED",              "pass": true,              "value": "jack"            },            "errorMsg": null,            "hasError": false          }        ],        "processId": 0,        "appType": "APP_R8MYLKYXXXXXX",        "dataMap": {          "textField_jfXXXXXX": "XXXXXX"        },        "originatorId": "XXXXXX",        "formUuid": "FORM-0G7KPV3WZL0U3AHTOA9BFVXXXXXX",        "dataType": "finst",        "originatorAvatar": "http://static.dingtalk.com/media/lADPBbCc1R7VwSHNXXXXXX.jpg",        "version": 0,        "createTime": "2018-04-12 19:44:14"      }    ],    "totalCount": 1,    "currentPage": 1  },  "success": true}

● 失败
{  "errorCode": "TIANSHU_000006",  "success": false,  "errorMsg": "没有权限"}

待办任务
● 接口路径： /v1/task/getTodoTasksInApp.json
● 请求类型： GET
● 参数：
参数名
描述
是否必填
示例
备注
pageSize
每页记录数
是
10
必须大于 0 默认 10 最大值：100
currentPage
当前页
是
1
必须大于 0 默认 1
keyword
关键词
否


● 返回值示例：
    ○ 成功
{  "result": {    "data": [      {        "processInstanceId": "XXXXXX",        "originatorName": "XXX",        "title": "XXX 发起的流程",        "originatorPhoto": "http://static.dingtalk.com/media/lADPdfafafsAXXXXXX.jpg",        "titleEn": "XXX 发起的流程",        "createTime": "2018-04-13 13:35:58",        "appType": "APP_R8MdfadfXXXXXX",        "originatorNameEn": "XXXXXX",        "originatorId": "XXXXXX",        "taskId": "XXXXXX",        "status": "NEW"      }    ],    "totalCount": 1,    "currentPage": 1  },  "success": true}

● 失败
{  "errorCode": "TIANSHU_000006",  "success": false,  "errorMsg": "没有权限"}

已完成任务
● 接口路径： /v1/task/getDoneTasksInApp.json
● 请求类型： GET
● 参数：
参数名
描述
是否必填
示例
备注
pageSize
每页记录数
是
10
必须大于 0 默认 10 最大值：100
currentPage
当前页
是
1
必须大于 0 默认 1
keyword
关键词
否


● 返回值示例：
    ○ 成功
{  "result": {    "data": [      {        "processInstanceId": "abc434rfds23XXXXXX",        "finishTime": "2018-03-28 17:46:14",        "originatorName": "",        "title": "XXX 发起的流程页面",        "originatorPhoto": "//img.alicdn.com/tfs/TB1msdfsXXXXXX.jpg",        "titleEn": "XXX 发起的流程页面",        "createTime": "2018-03-28 17:45:43",        "appType": "XXXXXX",        "originatorNameEn": "XXXXXX",        "originatorId": "XXXXXX",        "taskId": "XXXXXX",        "status": "COMPLETED"      }    ],    "totalCount": 1,    "currentPage": 1  },  "success": true}

● 失败
{  "errorCode": "TIANSHU_000006",  "success": false,  "errorMsg": "没有权限"}

抄送我的任务（应用纬度）
● 接口路径： /v1/task/getNotifyMeTasksInApp.json
● 请求类型： GET
● 参数：
参数名
描述
是否必填
示例
备注
pageSize
每页记录数
是
10
必须大于 0 默认 10 最大值：100
currentPage
当前页
是
1
必须大于 0 默认 1
keyword
关键词
否


processCodes
processCodes
否
["xx", "xxx"]

instanceStatus
实例状态
否

枚举值
● 返回值示例：
    ○ 成功
{  "result": {    "data": [      {        "modifiedTime": "2018-04-12 19:44:14",        "formInstanceId": "FINST-AJ1L4CJVXL0UIAIPR06ZA52U9HKUXXXXXX",        "title": "单据",        "instValue": [          {            "componentId": "node_jfwgghbo",            "componentName": "TextField",            "fieldId": "textField_jfwggg8e",            "label": "姓名",            "validation": [],            "fieldData": {              "complexType": "custom",              "dataType": "CHANGED",              "pass": true,              "value": "jack"            },            "errorMsg": null,            "hasError": false          }        ],        "processId": 0,        "appType": "APP_R8MYLKYXXXXXX",        "dataMap": {          "textField_jfXXXXXX": "XXXXXX"        },        "originatorId": "XXXXXX",        "formUuid": "FORM-0G7KPV3WZL0U3AHTOA9BFVXXXXXX",        "dataType": "finst",        "originatorAvatar": "http://static.dingtalk.com/media/lADPBbCc1R7VwSHNXXXXXX.jpg",        "version": 0,        "createTime": "2018-04-12 19:44:14"      }    ],    "totalCount": 1,    "currentPage": 1  },  "success": true}

● 失败
{  "errorCode": "TIANSHU_000006",  "success": false,  "errorMsg": "没有权限"}

附录
保存/更新 表单数据格式说明
● 表单中每个组件都有唯一 ID (在页面设计器组件右侧的高级面板可以查看唯一标识)，每个组件中填写的数据都有自己的固定格式。目前支持的表单组件有：单行，多行，数字，单选，下拉单选，多选，下拉多选，日期，日期区间，人员搜索框，地区选择，部门选择，级联选择，子表单组件。
● 保存/更新 表单数据时，用 Map<String, Object> 的 JsonString 格式来作为参数传递表单中的数据。key 为组件 ID，Object 为组件的值。每个组件的值格式如下：
组件类型
数据格式
数据格式
备注
单行输入框
字符串
"danhang"

多行输入框
字符串
"duohang"

数字输入框
数字
1

单选
字符串
"选项一"

下拉单选
字符串
"选项一"

多选
字符串数组
["选项一", "选项二"]

下拉多选
字符串数组
["选项一", "选项二"]

日期组件
时间戳
日期组件

级联日期
字符串数组
["1514736000000", "1517328000000"]。 假如只有结束时间，["", "1517328000000"]
第一个为开始时间的时间戳字符串，第二给结束时间的时间戳字符串
人员搜索框
字符串数组
["xxxxx", "yyyyy"]

城市选择
字符串数组
["110000", "110100", "110101"]
第一个必须为省份 ID，第二个为城市 ID，第三个为区 ID。
部门选择
字符串数组
["1123456"]
["xxx"] 里面是部门 id
级联选择
字符串数组
["part", "part_b"]
必须按照级联顺序，依次放到数组中
图片上传
字符串数组
[{"downloadUrl":"文件下载地址", "name": "文件名"}]

附件组件
字符串数组
[{"downloadUrl":"文件下载地址", "name": "文件名"}]

超链接组件
字符串数组
[{"link":"http://www.aliwork.com", "text":"宜搭"}]

子表单
JSONARRAY
[{"textField_jcr0069m": "danhang1"}, {"textField_jcr0069m": "danhang2"}] (textField_jcr0069m 为子表单下单行的组件 ID)
由于子表单下有多条记录，所以用 JSONARRAY。由于每条记录都是很多组件的值，因此用 JSONObject 来存每个组件对应的值
手写签名
字符串
"图片地址"

● 完整的表单数据格式如下：
{  "textField_jcr0069m": "danhang",  "textareaField_jcr0069n": "duohang",  "numberField_jcr0069o": 1,  "radioField_jcr0069p": "选项一",  "selectField_jcr0069q": "选项一",  "checkboxField_jcr0069r": [    "选项二",    "选项三"  ],  "multiSelectField_jcr0069s": [    "选项二",    "选项三"  ],  "dateField_jcr0069t": 1516636800000,  "cascadeDate_jcr0069u": [    "1514736000000",    "1517328000000"  ],  "employeeField_jcr0069x": [    "xxxxx"  ],  "citySelectField_jcr0069y": [    "110000",    "110100",    "110101"  ],  "departmentField_jcr0069z": 1123456,  "cascadeSelectField_jcr006a0": [    "part",    "part_b"  ],  "imageField_l096bb9l": [    {      "name": "蜡笔小新.jpg",      "previewUrl": "https://img.alicdn.com/imgextra/i4/O1CN01DD8OQA1Lnay0fZRs3_!!6000000001344-0-tps-640-452.jpg",      "downloadUrl": "https://img.alicdn.com/imgextra/i4/O1CN01DD8OQA1Lnay0fZRs3_!!6000000001344-0-tps-640-452.jpg",      "size": 19039,      "url": "https://img.alicdn.com/imgextra/i4/O1CN01DD8OQA1Lnay0fZRs3_!!6000000001344-0-tps-640-452.jpg"    }  ],    "attachmentField_jna1lvyb": [    {      "downloadUrl": "https://www.aliwork.com/fileHandle?appType=default_tianshu_app&fileName=edd07ca9-1d2e-44b5-98fe-c1e16202f90d.txt&instId=&type=download",      "name": "test.txt",      "previewUrl": "https://www.aliwork.com/inst/preview?appType=default_tianshu_app&fileName=test.txt&fileSize=4&downloadUrl=edd07ca9-1d2e-44b5-98fe-c1e16202f90d.txt",      "url": "https://www.aliwork.com/fileHandle?appType=default_tianshu_app&fileName=edd07ca9-1d2e-44b5-98fe-c1e16202f90d.txt&instId=&type=download",      "ext": "txt"    }  ],  "tableField_jcr006a1": [    {      "cascadeDate_jcr006aa": [        "1514736000000",        "1517328000000"      ],      "cascadeSelectField_jcr006ae": [        "product",        "product_a"      ],      "checkboxField_jcr006a7": [        "选项一",        "选项二",        "选项三"      ],      "citySelectField_jcr006ac": [        "120000",        "120100",        "120102"      ],      "dateField_jcr006a9": 1517328000000,      "departmentField_jcr006ad": ["1123456"],      "employeeField_jcr006ab": [        "yyyyy",        "xxxxx"      ],      "multiSelectField_jcr006a8": [        "选项一",        "选项二",        "选项三"      ],      "numberField_jcr006a4": 2,      "radioField_jcr006a5": "选项二",      "selectField_jcr006a6": "选项三",      "textField_jcr006a2": "子表单下单行",      "textareaField_jcr006a3": "子表单下多行"    }  ],    "digitalSignatureField_kt3nh972": "https://tianshu-vpc.oss-cn-shanghai.aliyuncs.com/5e03f863-dd39-4f62-ba9b-497af2c9ad9f.png"}

根据组件值进行条件搜索，组件值格式说明
● 表单中每个组件都有唯一 ID (在页面设计器组件右侧的高级面板可以查看唯一标识)，每个组件的搜索格式不一样。目前支持搜索的表单组件有：单行，多行，数字，单选，下拉单选，多选，下拉多选，日期，日期区间，人员搜索框，地区选择，部门选择，级联选择，子表单组件。
● 搜索时，用 Map<String, Object> 格式来表示每个组件的搜索条件。key 为组件 ID，Object 为组件的搜索值。各个组件的搜索类型和值格式如下
组件类型
数据格式
数据格式
备注
单行输入框
字符串
"danhang"
模糊搜索
多行输入框
字符串
"duohang"
模糊搜索
数字输入框
字符串数组
["1", "10"]
范围搜索。第一个为最小值，第二个为最大值
单选
字符串
"选项一"
精确搜索
下拉单选
字符串
"选项一"

多选
字符串数组
["选项二"]
数组搜索。搜索值必须是多选值的子集
下拉多选
字符串数组
["选项二"]
数组搜索。 搜索值必须是多选值的子集
日期组件
字符串数组
["1514736000000", "1517414399000"]
范围搜索。第一个为日期开始的时间戳，第二个为日期结束的时间戳。
日期区间
数组
[["1514736000000", "1517414399000"], ["1514736000000", "1517414399000"]]
范围搜索。第一个数组是日期区间开始的搜索范围。第二个数组是日期区间结束的搜索范围。
人员搜索框
字符串数组
["xxxxx", "yyyyy"]
["xxxxx", "yyyyyy"] 精确匹配。值必须完全匹配，工号顺序也需要一致。
城市选择
字符串数组
["110000", "110100", "110101"]
["110000", "110100", "110101"] 数组搜索。搜索值必须是城市值的子集。另外，有市 ID，就必须有省 ID。有区 ID，就必须有省 ID 和市 ID。
部门选择
数字
1123456
精确匹配
级联选择
字符串数组
["part", "part_b"]
数组搜索。和城市选择限制条件一致。
子表单组件
字符串
"danhang"
模糊搜索。子表单下的值为一个大 text，搜索用模糊搜索
● 完整例子
{  "textField_jcr0069m": "danhang",  "textareaField_jcr0069n": "duohang",  "numberField_jcr0069o": ["1", "10"],  "radioField_jcr0069p": "选项一",  "selectField_jcr0069q": "选项一",  "checkboxField_jcr0069r": ["选项二"],  "multiSelectField_jcr0069s": ["选项二", "选项三"],  "dateField_jcr0069t": [1514736000000, 1517414399000],  "cascadeDate_jcr0069u": [    [1514736000000, 1517414399000],    [1514736000000, 1517414399000]  ],  "employeeField_jcr0069x": ["xxxxx"],  "citySelectField_jcr0069y": ["110000", "110100", "110101"],  "departmentField_jcr0069z": ["1123456"],  "cascadeSelectField_jcr006a0": ["part", "part_b"],  "tableField_jcr006a1": "子表单数据"}

流程实例详情对象格式说明
● 表单中每个组件都有唯一 ID (在页面设计器组件右侧的高级面板可以查看唯一标识)，每个组件的搜索格式不一样。目前支持搜索的表单组件有：单行，多行，数字，单选，下拉单选，多选，下拉多选，日期，日期区间，人员搜索框，地区选择，部门选择，级联选择，子表单组件。
● 搜索时，用 Map<String, Object> 格式来表示每个组件的搜索条件。key 为组件 ID，Object 为组件的搜索值。各个组件的搜索类型和值格式如下
字段
描述
示例
备注
actioners
流程实例当前任务执行人
[{"userId": "workno", "name":{"zh_CN": "user_zh_name", "type": "i18n"}}]
如果流程已完成，没有执行人时，该字段为空
processInstanceId
实例 ID
"f30233fb-72e1-4af4-8cb8-c7e0ea9ee530"
唯一
formUuid
流程表单 ID
FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3

processCode
流程 Code
TPROC--EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ4

title
实例标题
xxxx 发起的流程
根据你的语言环境，返回对应的标题
instanceStatus
实例状态
RUNNING

approvedResult
流程结束时的审批结论
agree
agree -> 通过 disagree -> 拒绝
originator
字符串数组
[{"name":{"zh_CN": "user_zh_name", "type": "i18n"}, "userId": "workno"}]

data
表单数据

参考附录 4- 作为返回值的表单数据的格式说明
● 完整的数据格式 demo
{  "result": {    "data": {      "actioners": [        {          "name": {            "pureEn_US": "xxx",            "en_US": "xxx",            "zh_CN": "xxx",            "type": "i18n"          },          "userId": "xxx"        }      ],      "processInstanceId": "f30233fb-72e1-4af4-8cb8-c7e0ea9ee530",      "formUuid": "FORM-EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ3",      "data": {        "numberField_jcr0069o": 1,        "multiSelectField_jcr0069s": ["选项三", "选项二"],        "textareaField_jcr0069n": "duohang",        "employeeField_jcr0069x": ["xxxx"],        "departmentField_jcr0069z": "信息 xxx 平台",        "cascadeDate_jcr0069u": ["1514736000000", "1517328000000"],        "cascadeSelectField_jcr006a0": ["part", "part_b"],        "tableField_jcr006a1": [          {            "departmentField_jcr006ad": "信息 xxx",            "cascadeDate_jcr006aa": ["1514736000000", "1517328000000"],            "selectField_jcr006a6": "选项三",            "citySelectField_jcr006ac": ["天津", "天津市", "河东区"],            "radioField_jcr006a5": "选项二",            "employeeField_jcr006ab": ["yyyyy", "xxxxxx"],            "dateField_jcr006a9": 1517328000000,            "textField_jcr006a2": "子表单下单行",            "textareaField_jcr006a3": "子表单下多行",            "cascadeSelectField_jcr006ae": ["product", "product_a"],            "numberField_jcr006a4": 2,            "checkboxField_jcr006a7": ["选项一", "选项三", "选项二"],            "multiSelectField_jcr006a8": ["选项一", "选项三", "选项二"]          }        ],        "selectField_jcr0069q": "选项一",        "citySelectField_jcr0069y": ["北京", "北京市", "东城区"],        "checkboxField_jcr0069r": ["选项三", "选项二"],        "textField_jcr0069m": "danhang",        "radioField_jcr0069p": "选项一",        "dateField_jcr0069t": 1516636800000      },      "processCode": "TPROC--EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ4",      "originator": {        "name": {          "pureEn_US": "xxx",          "en_US": "xxxx",          "zh_CN": "xxx",          "type": "i18n"        },        "userId": "xxxx"      },      "title": "xxx 发起的流程",      "instanceStatus": "RUNNING"    },    "totalCount": 1,    "currentPage": 1  },  "success": true}

作为返回值的表单数据的格式说明
作为返回值的表单数据格式和 附录 1 保存/更新 表单数据格式说明基本一致。区别在于：
● 录入时，地区组件值为 ["省份 ID ", "市 ID ", "区 ID "]。作为返回值时，是 ["省名称", "城市名称", "地区名称"]。
● 单选，下拉单选，多选，下拉多选是有国际化的。返回值时，会根据传的 language 参数，返回对应的数据值。
表单实例详情对象格式说明
字段
描述
示例
备注
gmtModified
最后修改时间
2018-01-24 11:22:01

formUuid
表单 ID
FORM-EF6Y93URN24F1SCX15VA2P918LPEIJ2H3UFORCJ1

originator
发起人详情
[{"name":{"zh_CN": "user_zh_name", "type": "i18n"}, "userId": "workno"}]

formData
表单数据详情
TPROC--EF6Y4G8WO2FN0SUB43TDQ3CGC3FMFQ1G9400RCJ4
参考附录 4- 作为返回值的表单数据的格式说明
● 完整的数据格式 demo
{  "result": {    "gmtModified": "2018-01-24 11:22:01",    "formUuid": "FORM-EF6Y93URN24F1SCX15VA2P918LPEIJ2H3UFORCJ1",    "formInstId": "FINST-EF6Y93URN2F02S745LTMW2D2G4WVDS16O17ISCJ0",    "formData": {      "numberField_jcr0069o": 1,      "multiSelectField_jcr0069s": ["选项三", "选项二"],      "textareaField_jcr0069n": "duohang",      "employeeField_jcr0069x": ["xxxx"],      "departmentField_jcr0069z": "xxxx",      "cascadeDate_jcr0069u": ["1514736000000", "1517328000000"],      "cascadeSelectField_jcr006a0": ["part", "part_b"],      "tableField_jcr006a1": [        {          "departmentField_jcr006ad": "xxxx",          "cascadeDate_jcr006aa": ["1514736000000", "1517328000000"],          "selectField_jcr006a6": "选项三",          "citySelectField_jcr006ac": ["天津", "天津市", "河东区"],          "radioField_jcr006a5": "选项二",          "employeeField_jcr006ab": ["xxxxxx", "yyyyyy"],          "dateField_jcr006a9": 1517328000000,          "textField_jcr006a2": "子表单下单行",          "textareaField_jcr006a3": "子表单下多行",          "cascadeSelectField_jcr006ae": ["product", "product_a"],          "numberField_jcr006a4": 2,          "checkboxField_jcr006a7": ["选项一", "选项三", "选项二"],          "multiSelectField_jcr006a8": ["选项一", "选项三", "选项二"]        }      ],      "selectField_jcr0069q": "选项一",      "citySelectField_jcr0069y": ["北京", "北京市", "东城区"],      "checkboxField_jcr0069r": ["选项三", "选项二"],      "textField_jcr0069m": "danhang",      "radioField_jcr0069p": "选项一",      "dateField_jcr0069t": 1516636800000    },    "originator": {      "name": {        "pureEn_US": "userEnglishName",        "en_US": "userEnglishName",        "zh_CN": "userName",        "type": "i18n"      },      "userId": "xxxx"    }  },  "success": true}


钉钉 JS-API
钉钉提供了丰富的JSAPI能力，例如原生弹框、设备信息、扫描等能力，宜搭开发者可以利用钉钉原生提供的API能力提供更好的用户体验。
● 钉钉JSAPI功能列表;
● 钉钉开发者必读。
警告
调用钉钉JS-API需要注意以下事项：
● 宜搭应用中，不保证 window.dd 存在 (目前仅手机端会引入一个旧版资源)，建议用户手动引入;
● 宜搭应用中，即使不配置 dd.config 进行 JSAPI 鉴权操作，仍可调用需要鉴权后才能使用的 API。请谨慎调用;
● 调用 JSAPI 时，需要的 corpId 参数可以从 const { corpId } = window.pageConfig || {}; 获取;
使用指南
步骤1：异步加载钉钉JSAPI资源
由于宜搭页面中不保证 window.dd一定存在，所以保险起见，用户需要在页面的didMount生命周期中手动加载钉钉的JSAPI脚本，如下所示： 
实现代码如下所示：
export function didMount() {  this.utils.loadScript('https://g.alicdn.com/dingding/dingtalk-jsapi/3.0.25/dingtalk.open.js');}

资源引入完成后，即可通过 window.dd 调用 JSAPI 中的相关功能。
步骤2：调用钉钉JSAPI
钉钉的JSAPI加载完成后，我们便可以在动作面板中通过window.dd调用钉钉的API进行相应的操作了，如下所示：
export function isDingTalk() {  return window.navigator && /dingtalk/i.test(window.navigator.userAgent)}export function dingAlert() {  if (window.dd && this.isDingTalk()) {    window.dd.device.notification.alert({      message: "测试",      title: "提示",//可传空      buttonName: "收到",      onSuccess: function () {      },      onFail: function (err) { }    });  }}

钉钉端内的展示效果如下所示：

警告
由于很多钉钉JSAPI要求必须端内调用，因此在调用钉钉JSAPI时，需要提前先判断一下是否在钉钉端内，判断代码如下所示：
export function isDingTalk() {  return window.navigator && /dingtalk/i.test(window.navigator.userAgent)}

API列表
支持的API列表可参考钉钉开放平台文档。



服务端开放API
宜搭平台除了提供用于在 Client 端调用的开放 API，还提供了支持通过服务端进行调用的开放 API，具体详见钉钉开放平台文档。
使用指南
使用宜搭平台服务端开放 API 的步骤如下所示：

提示
钉钉开放平台提供多种应用类型，不同应用类型使用服务端开放API的方式有所不同，具体请查看钉钉应用类型介绍文档。
步骤 1：创建钉钉应用
● 创建企业内部应用，详情请参考企业内部应用开发流程介绍。
● 创建第三方企业应用，详情请参考第三方企业应用说明。
步骤 2：添加接口调用权限
应用创建后默认只开放登录和消息通知接口的调用权限，您需要根据开发需要，添加对应的接口使用权限。
● 企业内部应用，详情请参考添加接口调用权限。
● 第三方企业应用，详情请参考添加接口调用权限。
步骤 3：获取应用的 access_token
access_token 相当于是身份凭证。调用接口时，通过 access_token 来鉴权调用者身份。
● 企业内部应用请参考获取企业内部应用的 accessToken。
● 第三方企业应用请参考获取第三方应用授权企业的 accessToken。
API列表
流程
接口说明
企业内部应用
第三方企业应用
第三方个人应用
权限
发起宜搭审批流程
支持
支持
暂不支持
宜搭流程数据写权限
删除流程实例
支持
支持
暂不支持
宜搭流程数据写权限
终止流程实例
支持
支持
暂不支持
宜搭流程数据写权限
表单
接口说明
企业内部应用
第三方企业应用
第三方个人应用
权限
查询表单实例数据
支持
支持
暂不支持
宜搭表单数据读权限
保存表单数据
支持
支持
暂不支持
宜搭表单数据写权限
更新表单数据
支持
支持
暂不支持
宜搭表单数据写权限
查询表单数据
支持
支持
暂不支持
宜搭表单数据读权限
获取员工组件的值
支持
支持
暂不支持
宜搭表单数据读权限
获取表单组件定义列表
支持
支持
暂不支持
宜搭表单数据读权限
获取子表组件数据
支持
支持
暂不支持
宜搭表单数据读权限
删除表单数据
支持
支持
暂不支持
宜搭表单数据写权限
获取多个表单实例ID
支持
支持
暂不支持
宜搭表单数据读权限
批量获取表单实例数据
支持
支持
暂不支持
宜搭表单数据读权限
批量删除表单实例
支持
支持
暂不支持
宜搭表单数据读权限
批量创建表单实例
支持
支持
暂不支持
宜搭表单数据读权限
批量更新表单实例内的组件值
支持
支持
暂不支持
宜搭表单数据读权限
新增或更新表单实例
支持
支持
暂不支持
宜搭表单数据读权限
通过高级查询条件获取表单实例数据（包括子表单组件数据）
支持
支持
暂不支持
宜搭表单数据读权限
通过高级查询条件获取表单实例数据（不包括子表单组件数据）
支持
支持
暂不支持
宜搭表单数据写权限
通过表单实例数据批量更新表单实例
支持
支持
暂不支持
宜搭表单数据写权限
查询表单的变更记录
支持
支持
暂不支持
宜搭表单数据写权限
获取流程设计结构
支持
支持
暂不支持
宜搭表单数据写权限
获取组件别名列表
支持
支持
暂不支持
宜搭表单数据写权限
任务
接口说明
企业内部应用
第三方企业应用
第三方个人应用
权限
获取审批记录
支持
支持
暂不支持
宜搭流程数据读权限
同意或拒绝宜搭审批任务
支持
支持
暂不支持
宜搭流程数据写权限
获取组织内某人提交的任务
支持
支持
暂不支持
宜搭流程数据读权限
获取组织内已完成的审批任务
支持
支持
暂不支持
宜搭任务读权限
转交任务
支持
支持
暂不支持
宜搭任务写权限
查询流程运行任务（VPC）
支持
支持
暂不支持
宜搭任务读权限
获取任务列表（组织维度）
支持
支持
暂不支持
宜搭任务读权限
获取发送给用户的通知
支持
支持
暂不支持
宜搭任务读权限
查询抄送我的任务列表（应用维度）
支持
支持
暂不支持
宜搭任务读权限
提交评论
支持
支持
暂不支持
宜搭评论写权限
批量执行宜搭审批任务
支持
支持
暂不支持
宜搭评论写权限
批量查询宜搭表单实例的评论
支持
支持
暂不支持
宜搭评论写权限
附件
接口说明
企业内部应用
第三方企业应用
第三方个人应用
权限
获取宜搭附件临时免登地址
支持
支持
暂不支持
宜搭流程数据读权限
本文档对您是否有帮助？
 有用
 没用