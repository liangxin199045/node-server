const http = require('http');
const config =require('./config.js');
const domain = require('domain');

let isStartHeartBeat = false;

//拓展app，路由管理
const handleRequest =(request, response) => {
    if (request.url == '/') {
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("Home Page!\n");
    } else if (request.url == '/about') {
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("About Page!\n");
    } else {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end("404 Not Found!\n");
    }
    console.log('worker pid: '+process.pid+' 处理了一个请求');
    process.send({
        cmd: 'dealRequest',
        status: 'done'
    });
}

//反向代理转发测试环境
const proxyToTest = (request, response)=>{
    if (request.url == '/test') {
        //转发到测试环境回包
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("test env ok Page!\n");
        console.log('worker pid: '+process.pid+' 转发了一个请求到测试环境');
    } 
}

//初始化请求生命周期domain对象
const appHandler = (req, res) => {
    //判断号码是否添加测试环境，是否需要反向代理转发
    if(req.url == '/test'){
        proxyToTest(req,res);
        return;
    }

    // 为每一个请求，创建了一个domain实例
    let d = domain.create();// 创建domian实例
    console.log('请求生命周期对象domain已创建')
    // handleRequest执行过程中，所有的同步，异步的error都会被当前的domain.error捕获到
    d.on('error', (er) => {
        console.log(er);                //打印错误
        // console.log(req);               //打印请求对象req
        // console.log(process.domain);    //打印domain对象
        //记录到domain对象上
    });

    d.add(req);
    d.add(res);
    d.currentContext = {};//空对象
    d.currentContext.log = {}; // 挂载在domain实例上的日志对象
    d.currentContext.request = req;
    d.currentContext.response = res;

    //日志处理
    let dealLog =function(){
        //一般染色用户的日志都会上报到cmem，然后管理端直接从cmem拉取全息日志
        //未染色用户的日志则只是本地记录而已
        //错误日志等都会上报流水
        if(req.url =='/about'){ //假设染色判断逻辑为路径中含about
            console.log('请求处理完毕，全息日志已经上报cmem完毕')
        }else{
            console.log('请求处理完毕，访问日志已经记录本地完毕')
        }
    };

    // 清理domain对象
    let clear = function(){
        res.removeAllListeners('finish');
        d.remove(req);
        d.remove(res);

        if (d.currentContext) {
            if (d.currentContext) {
                d.currentContext.request = null;
                d.currentContext.response = null;
            }
            d.currentContext.log = null;
            d.currentContext = null;
        }

        d = null;
        req = null;
        res = null;
        console.log('请求生命周期对象domain已销毁')
    };

    // 监听响应回包的finish事件
    res.once('finish', function() {
        dealLog();  //先处理日志
        clear();    //再清理domian
    });
    // 调用handleRequest函数内，所有的异步/同步错误都会被domain的error事件捕获
    d.run(() => {
        handleRequest(req, res);
    });
}

const httpServer =http.createServer(appHandler);

//监控未捕获的worker进程错误
process.on('uncaughtException', function(e) {
    console.log(e && e.stack);
});

//监控master发送的消息
process.on('message', function(args) {
    if (!args) {
        return;
    }
    if (!args.cmd) {
        return;
    }
    if(args.from =='master' && args.cmd =='listen'){
        console.log('worker' +process.pid+ 'listen');
        listen();
    }
});

const heartBeat = () =>{
    //发送心跳包,通知master进程
    process.connected && process.send && process.send({
        cmd: 'heartBeat',
        memoryUsage: process.memoryUsage()
    });
}

const startHeartBeat = () =>{
    if (isStartHeartBeat) {
        return;
    }
    isStartHeartBeat = true;
    setInterval(heartBeat, 5000);
}

const listen =()=>{
    httpServer.listen({
        host: config.httpAddress,
        port: config.httpPort,
        exclusive: false
    },function(){
        console.log('worker pid: '+ process.pid +' start heartbeat');
        startHeartBeat();
    });
}

