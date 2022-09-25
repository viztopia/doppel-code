const io = require('socket.io-client');
const { exec } = require("child_process");
var cmd=require('node-cmd');


//------------------socket--------------------
let socket;
// let ip = "192.168.1.2"; //the IP of the machine that runs server.js
let ip = "127.0.0.1"; //or local host
let port = 8081; //the port of the machine that runs server.js


//---------------------socket stuff------------------------------
function setupSocket() {
    console.log("connectting to server...")
    socket = io.connect("http://" + ip + ":" + port, {
      port: port,
      rememberTransport: false,
    });
    socket.on("connect", function() {
        console.log("connected to server")
    });
  
    //-----------play sound----------------
    socket.on("playsound", function(msg) {
        const secs = msg.secs
        bashCommand = "vlc C:\Users\iiiiii\Downloads\boston_9_15_fixed.wav --start-time " + secs//past vlc command here
        // bashCommand = "dir"
        cmd.run(bashCommand, (error, stdout, stderr) => {
            if (error) {
                console.log(`error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
        });
    });
}


setupSocket();
