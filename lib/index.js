const cluster = require('cluster');     //集群模块
const config = require('./config.js');
const os = require('os');
const { fork } = require('child_process');      //child_process模块
const path = require('path');

let  RequestDoneNum =0;         //总请求个数

//fork新的worker子进程
const restartWorker = (worker) =>{
    if (worker.hasRestart) {
        return;
    }
    cluster.fork();
    closeWorker(worker);
    worker.hasRestart = true;
}

// 关闭worker
const closeWorker =(worker) => {
    worker.kill(9);
}

// 处理子进程的心跳消息
const heartBeat = function (m) {
    const worker = this;
    const now = new Date().getTime();
    worker.lastMessage = m;
    worker.lastLiveTime = now;
};

//master监控worker进程相关事件处理
const masterEventHandler = () => {
    //master主进程名称
    process.title = 'TSW/worker/master-monitor';
    //master主进程异常事件监听处理
    process.on('uncaughtException', function (e) {
        console.log(e && e.stack);
    });
    //master主进程监听自定义reload事件，重新fork全部worker子进程
    process.on('reload', function () {
        for (const id in cluster.workers) {
            const worker =cluster.workers[id];
            restartWorker(worker);
        }
        console.log('reload done');
    });
    //master主进程监听自定义showRuningWorkers事件，展示进程池中正常工作的worker子进程
    process.on('showRuningWorkers', function () {
        let str ='进程池中正常服务中的worker子进程有:';
        for (const id in cluster.workers) {
            const pid =cluster.workers[id].process.pid;
            str = str+'worker:id='+id+'&pid='+pid+' ';
        }
        console.log(str);
    });


    // 监听worker子进程是否fork成功
    cluster.on('fork', function (currWorker) {
        console.log('worker进程 ' + currWorker.process.pid + ' 创建成功')
        
        //监听worker子进程发来的消息
        currWorker.on('message', function (args) {
            if (args.cmd =='heartBeat'){
                heartBeat.apply(this,args);
            }else if(args.cmd =='dealRequest'){
                RequestDoneNum++;
                console.log('master-worker服务体系共处理了 '+RequestDoneNum+' 个请求');
            }
        });
        //通知worker子进程开始监听
        currWorker.send({
            from: 'master',
            cmd: 'listen'
        });
    });
    // 监听子进程退出时做的处理
    cluster.on('disconnect', function (worker) {
        restartWorker(worker);
    });
    // 监听子进程被杀死时做的处理
    cluster.on('exit', function (worker) {
        restartWorker(worker);
    });
}

//定时检测子进程存活，15秒未响应的采取措施
const checkWorkerAlive = () =>{
    const checkWorkerAliveTimeout = 5000;

    setInterval(function () {
        const nowDate = new Date();
        const now = nowDate.getTime();
        for (const id in cluster.workers) {
            const worker =cluster.workers[id];
            worker.lastLiveTime = worker.lastLiveTime || now;
            if (!worker.startTime) {
                worker.startTime = now;
            }
            // 无响应进程处理
            if (now - worker.lastLiveTime > checkWorkerAliveTimeout * 3) {
                console.log('worker:id='+worker.id+'&pid='+worker.process.pid+'的子进程无响应，kill后自动fork新子进程代替它')
                restartWorker(worker);
                continue;
            }
        }
    }, checkWorkerAliveTimeout);
}

//master起一个admin httpserver,对外提供管理master的API,限本机调用
const startAdmin = () => {
    require('./admin.js').start();
}

//启动一个监控master进程的monitor进程
const startMasterMonitor = () => {
    console.info('start master monitor....');
    fork(path.resolve(__dirname, './monitor.js'), [process.pid], {
        silent: false
    });
}

//进程管理
const startServer =() =>{
    cluster.schedulingPolicy = cluster.SCHED_RR;

    if (cluster.isMaster) {
        console.log(`master主进程 ${process.pid} 启动运行`);
        //获取CPU数目
        let numCPUs = os.cpus().length;
        if (config.runAtThisCpu && config.runAtThisCpu !='auto'){
            numCPUs = config.runAtThisCpu;
        }
        // 衍生工作进程。
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }
        
        masterEventHandler();
        checkWorkerAlive();
        startAdmin();
        startMasterMonitor();  
    } else {
        // console.log(`worker进程 ${process.pid} 启动运行`);
        // 工作进程可以共享任何 TCP 连接, 这里虽然表面上创建了多个 http 服务, 但是本质上共享的是一个 HTTP 服务器。
        require('./worker.js');
    }
}

startServer();      //总入口函数