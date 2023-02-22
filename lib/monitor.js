
'use strict';
const http = require('http');
const config = require('./config.js');

const PING_RETRY_TIME = 2;
const PING_TIMEOUT = 10000;
const PING_INSTERVALS = 30000;      //30s就ping一次

let masterPid;
let retry = 0;

function ping() {

    return new Promise((resolve, reject) => {

        const req = http.request({
            method: 'GET',
            hostname: config.httpAdminAddress,
            port: config.httpAdminPort,
            path: '/ping',
            timeout: PING_TIMEOUT
        });

        req.on('response', (res) => {
            console.log('ping master正常');
            resolve();
        });

        req.on('error', (e) => {
            console.log('ping error');
            reject(new Error('Master response error'));
        });

        req.on('timeout', () => {
            console.log('ping timeout');
            reject(new Error('Master Timeout'));
        });

        req.end();
    });
}

async function run() {

    try {
        await ping();
        retry = 0;
        setTimeout(run, PING_INSTERVALS);
    } catch (e) {
        if (retry >= PING_RETRY_TIME) {
            console.log('ping master fail. restart master...');
            restartMaster();
        } else {
            retry++;
            console.log('ping master fail.retry:'+retry);
            setTimeout(run, PING_INSTERVALS);
        }
    }
}

function restartMaster() {
   console.log('重启master');
}

function startMonitor() {

    masterPid = process.argv[2];

    console.log('master monitor 进程启动 pid:'+masterPid);

    process.title = 'master-monitor-worker';

    if (!masterPid) {
        console.log('master pid is empty! exit monitor');
        return;
    }

    run();
}

startMonitor();
