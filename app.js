var express = require('express'),
    app = express(),
    server = require('http').Server(app),
    piblaster = require('pi-blaster.js'),
    ip = require("ip");

app.use(express.static(__dirname + '/'));
app.set('view engine', 'html');

var app_port=8082;
app.get('/', function(req, res) {
    res.render(__dirname + '/index.html', { localip: ip.address() });
});
app.listen(app_port);

console.log('Web server listening, visit http://' + ip.address() + ':' + app_port);

var motor_pwm_pin = 17;
var pwm_motor_init = 0.16;                           // neutral position
var pwm_motor_min = pwm_motor_init / 2;              // max backward capacity
var pwm_motor_max = pwm_motor_init + pwm_motor_min;  // max forward capacity

var pwm_motor_off = 0.0;
var pwm_motor_min_limit = 0.1; // move backward slower than possible
var pwm_motor_max_limit = 0.2; // move forward slower than possible

var speed = 0;                                   // neutral position
var default_speed_step_width = 1;
var speed_num_steps = 20;
var speed_min = (-1) * speed_num_steps / 2;      // max steps backward
var speed_max = speed_num_steps / 2;             // max steps forward

function speed2pwm(s) { 
    pwm = pwm_motor_min + ((pwm_motor_max - pwm_motor_min) * ((s + speed_max) / speed_num_steps));

    pwm = Math.min(pwm, pwm_motor_max_limit);
    pwm = Math.max(pwm, pwm_motor_min_limit);

    console.log('speed pwm: ' + pwm);
    return pwm;
}

var servo_pwm_pin = 18;
var pwm_servo_min = 0.05;
//var pwm_servo_neutral = 0.1;
var pwm_servo_max = 0.15;

var angle = 0;
var default_angle_step_width = 15;
var angle_min = -45;
var angle_max = 45;

function angle2pwm(a) {
    pwm = pwm_servo_min + (pwm_servo_max - pwm_servo_min) * (a + 45) / 90;
    
    console.log('angle pwm:' + pwm);
    return pwm;
}

// Main POST control

app.post('/start', function (req, res) {
    start();
    res.end();
});

app.post('/stop', function (req, res) {
    stop();
    res.end();
});

app.post('/forward', function (req, res) {
    moveForward(default_speed_step_width)
    res.end();
});

app.post('/backward', function (req, res) {
    moveBackward(default_speed_step_width)
    res.end();
});

app.post('/left', function (req, res) {
    moveLeft(default_angle_step_width);
    res.end();
});

app.post('/right', function (req, res) {
    moveRight(default_angle_step_width);
    res.end();
});

function start() {
    console.log('start');

    speed = 0;
    piblaster.setPwm(motor_pwm_pin, pwm_motor_init);
}

function stop() {
    console.log('stop');
    
    speed = 0;
    piblaster.setPwm(motor_pwm_pin, pwm_motor_off);
    
    angle = 0;
    piblaster.setPwm(servo_pwm_pin, angle2pwm(angle));
}

function moveForward(step_width) {
    speed = speed + step_width;

    speed = Math.min(speed, speed_max);
    speed = Math.max(speed, speed_min);

    console.log('move forward: ' + speed);

    piblaster.setPwm(motor_pwm_pin, speed2pwm(speed));
}

function moveBackward(step_width) {
    var prev_speed = speed;
    speed = speed - step_width;
    
    speed = Math.min(speed, speed_max);
    speed = Math.max(speed, speed_min);

    console.log('move backward: ' + speed);
    
    piblaster.setPwm(motor_pwm_pin, speed2pwm(speed));

    // Double-click procedure.
    // Can also be done manually, depending on your preference and need
    if (prev_speed == 0) {
      runDoubleClickProcedure();
    }
}

async function runDoubleClickProcedure() {
    console.log('Run double-click procedure automatically');
    await sleep(200);
    piblaster.setPwm(motor_pwm_pin, speed2pwm(0));
    await sleep(200);
    piblaster.setPwm(motor_pwm_pin, speed2pwm(speed));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function moveLeft(step_width) {
    angle = angle - step_width;

    angle = Math.min(angle, angle_max);
    angle = Math.max(angle, angle_min);
    
    piblaster.setPwm(servo_pwm_pin, angle2pwm(angle));
    console.log('press left: '+ angle);
}

function moveRight(step_width) {
    angle = angle + step_width;

    angle = Math.min(angle, angle_max);
    angle = Math.max(angle, angle_min);
    
    piblaster.setPwm(servo_pwm_pin, angle2pwm(angle));
    console.log('press right: ' + angle);
}

// User hits Ctrl+C
process.on('SIGINT', function() {
    stop();
    console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
    
    return process.exit();
});

var ws_port=3002;
var user_id;
var wss = require("ws").Server({server: server, port: ws_port});
wss.on("connection", function (ws) {

    console.log("Websocket connection opened");

    var timestamp = new Date().getTime();
    user_id = timestamp;

    ws.send(JSON.stringify({msgType:"onOpenConnection", msg:{ connectionId: user_id }}));

    ws.on("message", function (data, flags) {
        var client_message = data.toString() + "";
        console.log("Websocket received a message: " + client_message + " (" + typeof(client_message) + ")");

        if (!(client_message === 'undefined')) {
            if (client_message.indexOf("start") == 0) {
                start();
            }
            else if (client_message.indexOf("stop") == 0) {
                stop();
            }
            else if (client_message.indexOf("angle:") == 0) {
                var angle_str = client_message.split(":")[1].trim();
                console.log("normalized angle: " + angle_str);
                normalized_angle = parseFloat(angle_str);
                //TODO: Convert normalized value to angle and pass on
            } 
            else if (client_message.indexOf("speed:") == 0){
                var speed_str = client_message.split(":")[1].trim();
                console.log("normalized speed: " + speed_str);
                normalized_speed = parseFloat(speed_str);
                //TODO: Convert normalized value to speed and pass on
            }
        }

        ws.send(JSON.stringify({ msg:{ connectionId: user_id } }));
    });

    ws.on("close", function () {
        console.log("Websocket connection closing");
        stop();
    });
});
console.log("Websocket server created");