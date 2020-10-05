'use strict';

const config = require('./config.js');
const http = require('http');


const admin = (request, response) => {
    if (request.url == '/ping') {
        response.writeHead(200);
        response.end('ok');
    } else if(request.url == '/reload'){
        response.writeHead(200);
        response.end('reload ok');
        process.emit('reload');
    } else if(request.url == '/showRuningWorkers'){
        response.writeHead(200);
        response.end('showRuningWorkers ok');
        process.emit('showRuningWorkers');
    } else {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end("404 Not Found!\n");
    }
}

const server = http.createServer(admin);

server.on('error', serverError);

function serverError(err) {
    console.log('exit with ' + err.stack);

    setTimeout(function () {
        process.exit(1);
    }, 500);
}


this.start = function () {
    // 管理进程开启info日志
    console.log('start admin...');

    server.listen(config.httpAdminPort, config.httpAdminAddress, function () {
        console.log('admin listen ok');
    });
};

