/*
This is a program for an elite, narrow group of several Epic Box operators in the world. 
If you are not one of them, reading this code is pointless.
*/

// Rabbitmq driver
const amqplib = require( 'amqplib/callback_api')

// Html server used for websockets server
const {createServer} = require("http")

// Used for execute rust module which fast check addreses and verify signatures 
const { execFile } = require('node:child_process')

// Mogodb driver for externally store messageid and slates for ver 2.0.0. of epicbox, tp work with answer by wallet with slate id message
// const { MongoClient } = require('mongodb');

// For generate uid message id for Slate sending to wallet.
const uid = require('uid2')

// Websocket for communicate with other epicboxes, and Websocket Server for receive all ws connections from wallets
const { WebSocket, WebSocketServer } = require('ws')

var challenge = "7WUDtkSaKyGRUnQ22rE3QUXChV8DmA6NnunDYP4vheTpc"

// change to your epicbox domaina
const epicbox_domain = "epicbox.fastepic.eu"
const epicbox_port =  443

// change to your port - standard is 3423 - remeber to open locale firewall - in linux sudo ufw 3424 allow
// you can run many instance of this epicbox - simpel copy folder with other name and change this port to next which you want
// remeber to correct set nginx to switch between different instances of epic box - read more in my git about it.
const localepicboxserviceport = 3424

// where is your RabbitMq ... all instances of epicboxes which works udner your domain must use the same RabbitMq 
// so if you have this epicbox on other computer then RabbitMq change to correct ip and remeber to set firewall to open correct ports for RabiitMq 
const rabbitmqaddress = 'amqp://localhost';

// interval for check in intervals if new Slates are for connected wallets ( it is not the same what interval in wallets ! )
var interval = null

// for RabbitMq connection
var rabbitconn = null

//
// Path to rust executable app. All epicbox instances can use the same path if has access to it.
// must be compiled like descibed in Readme.md
//
const pathtoepicboxlib = "./epicboxlib/target/release/epicboxlib"





// html webpage displayed when you open domain in webbrowser. Information about other main epicbox servers.
// this webpage can be rather small in size
const html = "<!DOCTYPE html>\n\
<html>\n\
<head>\n\
<title>Epicbox</title>\n\
<style>a:link {\n\
  color: orange;\n\
} a:visited {\n\
  color: orange;\n\
}</style>\n\
</head>\n\
<body style='background-color: #242222; color: lightgray; margin-left: 20px;''>\n\
\n\
<h1>Epicbox servers.</h1>\n\
<p>Asia, Australia - epicbox.hyperbig.com</p>\n\
<p>North America, South America - epicbox.epic.tech</p>\n\
<p>US East Cost - epicbox.epicnet.us</p>\n\
<p>Africa, Europe - epicbox.fastepic.eu</p>\n\
<br>\n\
<p>More about Epic</p>\n\
<a href='https://epic.tech'>Epic Cash main webpage</a>\n\
<br>\n\
<br>\n\
    Example use in toml file.\n\
\n\
<pre>\n\
<code>\n\
\n\
[epicbox]\n\
epicbox_domain = 'epicbox.fastepic.eu'\n\
epicbox_port = 443\n\
epicbox_protocol_unsecure = false\n\
epicbox_address_index = 0\n\
epicbox_listener_interval = 10\n\
\n\
</code>\n\
</pre>\n\
\n\
</body>\n\
</html>"


const requestListener = function (req, res) {
      res.writeHead(200)
      res.end(html);
}


//
// HTTMl server creation with function for receives requests
// Used by WebSocketServer
//
const server =  createServer(requestListener);


// uncommented WebSocket creation with option for zip messages 
/*
const wss = new WebSocketServer({
  //port:  3425,
  server:server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024 // Size (in bytes) below which messages
    // should not be compressed if context takeover is disabled.
  }
})*/


//WebSocket creation using HTTML server
const wss = new WebSocketServer({
  server:server,  
})

// function pon connectione - run when wallets connect by webscoket to epicbox 
wss.on('connection', function connection(ws, req) {
  
  ws.epicboxver = null;
  ws.iphere =  null;
  // it is taken from nginx
  if(req.headers['x-forwarded-for']) ws.iphere = req.headers['x-forwarded-for'].split(',')[0].trim();
  const ip2 =  req.socket.remoteAddress;

  console.log(`[${new Date().toLocaleTimeString()}] Connection from ip `, ws.iphere, " nginx/firewall ", ip2)

  ws.queueforsubscribe = null

  ws.on('close', (code, reason)=>{
     try{
      if(ws.queueforsubscribe!=null) {                                        
        console.log("Socket close for ", ws.queueforsubscribe)
         ws.queueforsubscribe = null;


        ws.channelforsubscribe.close((err)=>{
         if(err!=null)  console.error(err)
         ws.channelforsubscribe = null;
        })


      }
      console.log( `[${new Date().toLocaleTimeString()}] Close by code: `, code, " and reason ", reason.toString())

    } catch(err){
      console.error(err)
    }

  })

  ws.on('error', (errws) =>{
    console.error(errws)
    try{
      
      if(ws.queueforsubscribe!=null) { 
        ws.queueforsubscribe = null; 
	ws.channelforsubscribe,close((errorch)=>{
       
        console.error(errorch)
	ws.channelforsubscribe = null;	
        
        });
      }  
    } catch(err){
      console.error(err)
    }
  });


  //
  //  Standard method send by wallets or by epicboxes to epicbox
  //  one Made is added for receive accept from wallets ( epicbox 2.0.0 suggestion )
  //
  ws.on('message', function message(data) {
    
   // console.log('received: %s', data)
    try{
      if(data.toString()=="ping") { ws.send("pong"); /*console.log("ping");*/ return; }
      if(data.toString()=="pong") {ws.send("ping"); /*console.log("pong");*/return;}    
   	  let json=JSON.parse(data)
      
       if(json.type=="Challenge") {
         console.log(json)
         console.log('[%s][%s] -> [%s] send return [%s]', new Date().toLocaleTimeString(), ws.iphere, "Challenge", challenge) 
         ws,send(JSON.stringify({"type": "Challenge","str": challenge}))

       } else if(json.type=="Subscribe") {
           console.log(json)
           console.log('[%s][%s] -> [%s]', new Date().toLocaleTimeString(), ws.iphere, "Subscribe")
           subscribe(ws, json)	
       } else if(json.type=="Unsubscribe") {
           console.log(json)
           console.log('[%s][%s] -> [%s]', new Date().toLocaleTimeString(), ws.iphere, "Unsubscribe")
           unsubscribe(ws, json)  
       } else if(json.type=="PostSlate"){
          console.log('[%s][%s] -> [%s]', new Date().toLocaleTimeString(), ws.iphere, "PostSlate")
          postslate(ws, json)
       } else if(json.type=="Made"){
          console.log('[%s][%s] -> [%s]', new Date().toLocaleTimeString(), ws.iphere, "Made")
          made(ws, json)

       } else console.log('received: %s', data); 

    } catch(err){
	  
    }
  });

  // here we send Challenge to wallet or other epicbox when connected

  let jsonhello = {"type":"Challenge","str":challenge}

  ws.send(JSON.stringify(jsonhello));

});

//
// Subscribe function run when wallet send Subscribe message
//
async function subscribe(ws, json){
  console.log("subscribe ", json.address)
  
  try{
   
   // check if wallet wants use ver 2.0.0  
   if(json.hasOwnProperty("ver") && json.ver=="2.0.0") ws.epicboxver = "2.0.0"; 
    
   // here we store address of wallet which is queue in RabbitMq 
   ws.queueforsubscribe = json.address  
    
   // start check using externally rust program for verify signature send from wallet 
   const child = execFile(pathtoepicboxlib, ["verifysignature", json.address , challenge, json.signature], (error, stdout, stderr) => {
     if (error) {
        throw error;
     }
     
     var isTrueSet = (stdout === 'true');
     
     // if sugnature is OK
     if(isTrueSet) {

        // open Channel in RabbitMq and assert Queue for wallet address to check if new Slates waiting for it
        rabbitconn.createChannel((err1, ch2) => {
            if (err1) throw err1;
	         
            ch2.assertQueue(json.address,{expires:86400000 });
            
            ws.send(JSON.stringify({type:"Ok"}))
  
          try {
            
            // read the first SLate from RabbitMq and send to wallet using Slate message
            if(json.address!=null) ch2.get(json.address, {noAck:false}, (err, msgrabbit)=>{
                if(msgrabbit!=false && err==null) {
                      console.log("try send for ", json.address)

                  let fromrabbit = JSON.parse(msgrabbit.content.toString("utf8"))
                  let answer= {}
                  answer.type="Slate"
                  answer.from = msgrabbit.properties.headers["epicbox-reply-to"]
                  answer.str = fromrabbit.str
                  answer.signature = fromrabbit.signature
                  answer.challenge = fromrabbit.challenge
                  //answer.challenge = "testchallenge"
                  //let answerstr = JSON.stringify(answer)

                  let answerstr = null
                  let binar = null

                  // chekc if wallet use 2.0.0 - if use write messageid in externally mongdb for accept when wallet answer by Made message on ws
                  if(json.hasOwnProperty("ver") && json.ver=="2.0.0" && msgrabbit.properties.hasOwnProperty("messageId")){


                            let messageid = msgrabbit.properties.messageId                           

                              answer.epicboxmsgid = messageid
                              answer.ver = json.ver
                              answerstr = JSON.stringify(answer)
                                                            
                              //binar = Buffer.from(answerstr, 'latin1');

                              //ws.send(binar, { binary: true })
                              
                              ws.send(answerstr)  

                  } else {


                      // standard answer fro ver 1.0.0 of epicbox 
                      answerstr = JSON.stringify(answer)
                      //console.log(answer)

                      //binar = Buffer.from(answerstr, 'latin1');

                      //ws.send(binar, { binary: true })

                      ws.send(answerstr)

                      ch2.ack(msgrabbit)


                  }

                  

                } else {
                 // console.log("msgrabbit ", msgrabbit)
                 //console.log("Error ", err)
                }

                
            });
            
            // store in ws channel and rabbitmq queue for later close and destroy when wallet send Unsubscribe message 
            ws.channelforsubscribe = ch2 
            ws.queueforsubscribe = json.address  
            

        } catch(err){
          console.log(err)
        }
              
            
            
        })
         

     } else {
      console.log("Signature error")
      ws.send(JSON.stringify({type:"Error", kind:"signature error", description:"Signature error"}))
     }
   });
  
 } catch(err){
        console.log(err)
	      ws.send(JSON.stringify({type:"Error", kind:"signature error", description:"Signature error"}))
  }
}


//
// run when wallet sent Unsuscribe Message
//
async function unsubscribe(ws, json){
  

  try{

  // fast send Ok message to wallet, because unsubscribe rather always without error  
  ws.send(JSON.stringify({type:"Ok"}))

  } catch(e) {

    console.log(e)
  } 


  try{

  console.log("unsubscibe ", ws.queueforsubscribe)

  if(ws.queueforsubscribe!=null) {


      if(ws.queueforsubscribe!=json.address) {
        console.log("Different subcribed and unsubscribe address ????")
      }
      ws.queueforsubscribe = null;
      

      ws.channelforsubscribe.close((err)=>{
         if(err!=null)  console.error(err)
         ws.channelforsubscribe = null; 
      })
 
        console.log("Unsubscribe ", json.address)
      

  } else {

    try {

     // ws.send(JSON.stringify({type:"Error", kind:"Unsubscribe error", description:"unsubscibe too fast send"}));

    } catch(err){
      console.log("Problem to send to ws")
    }
  }

  } catch(errr){
        console.error(errr)
    }
}


//
// Run when wallet or other epicbox want send to epicbox Slate
// it can send to other epicbox when to address domain is differnet when our epicbox domain
//
async function postslate(ws, json){
  
  try {
     console.log("postslate from ", json.from, "to ", json.to)

   let from = json.from.split('@')
   from  = from[0]

   // use externally rust program to verify addresses - it is the same which is used to verify signatures
   const childadd = execFile(pathtoepicboxlib, ['verifyaddress',  json.from, json.to], (erroradr, stdoutadr, stderradr) => {
    if(erroradr){
    	throw erroradr
    }
   
    var isTrueSetadr = (stdoutadr === 'true');

    if(isTrueSetadr) { 

     // use rust program to verify signatures
     const child = execFile(pathtoepicboxlib, ["verifysignature", from , json.str, json.signature], (error, stdout, stderr) => {

       if (error) {
          throw error;
       }
       
       var isTrueSet = (stdout === 'true');
       
       
       if(isTrueSet) {
           
           preparePostSlate(ws, json, "")
       
       } else {
             
             // check again signatures --- why ? it is rather never used, but it is in orginal rust code.
             const child2 = execFile(pathtoepicboxlib, ["verifysignature", from , challenge, json.signature], (error, stdout, stderr) => {
              
                 var isTrueSet2 = (stdout === 'true');
                 if(isTrueSet2){
                   preparePostSlate(ws, json, challenge);
                  } else {
                   ws.send(JSON.stringify({type:"Error", kind:"postslate error", description:"PostSlate error"}))
                 }
             })
       }    

    })

    }  else {
                 ws.send(JSON.stringify({type:"Error", kind:"postslate error", description:"PostSlate Addresses error"}))
     
    }
   })


  } catch(err){
    console.error("postslate ", err)
    ws.send(JSON.stringify({type:"Error", kind:"postslate error", description:"PostSlate error"}))

  } 

}


//
// run only for wallets used ver 2.0.0
// for standard wallets never used
// it say by message Made that slate was received and correct made in wallet
// then epicbox can remove Slate from RabbotMq and message id from mongodb
//
function made(ws, json){

  if(json.hasOwnProperty("epicboxmsgid") && ws.epicboxver=="2.0.0" && json.hasOwnProperty("ver") && json.ver=="2.0.0"){

     // check signature by externally rust app 
     const child = execFile(pathtoepicboxlib, ["verifysignature", json.address , challenge, json.signature], (error, stdout, stderr) => {
         if (error) {
            throw error;
         }

         var isTrueSet = (stdout === 'true');
         
         if(isTrueSet) {

            rabbitconn.createChannel((err1, ch2) => {
              if (err1) throw err1;

              ch2.assertQueue(json.address,{expires:86400000 });
              
                          let made = false;

                          // read all messages from RabbitMq to find this one which could be ack ( removed from queue)
                          do{
                            ch2.get(json.address, {noAck:false}, (err, msgrabbit)=>{
                              if(msgrabbit) {
                                if(msgrabbit.properties.messageId == json.epicboxmsgid) {
                                  ch2.ack(msgrabbit)
                                  made = true;
                                  console.log("message ack ", json.epicboxmsgid)
                                //  collection.deleteOne({messageid:json.epicboxmsgid}).then((deleteResult)=>{
                                    console.log("Delete result ", deleteResult)
                                //  })
                                }
                              } else {
                                made = true
                              }
                            })
                          } while(made==true);

                        
              })
              ws.send(JSON.stringify({type:"Ok"}))
                          

         } else {
          ws.send(JSON.stringify({type:"Error", kind:"signature error", description:"Signature error"}))
  
         }

     })


  } else {

    ws.send(JSON.stringify({type:"Error", kind:"incorrect request", description:"Dont know this function without correct version"}))
  
  }

}

//
// run from postslate or forpostpostslat
// prepare received Slate for store in RabbitMq or send to other epicbox if domain of to address is different from this epicbox domain
//
function  preparePostSlate(ws, json, chall){

     let str = JSON.parse(json.str)
     let addressto= {}
     addressto.publicKey = str.destination.public_key
     addressto.domain = str.destination.domain
     addressto.port = str.destination.port
     if(addressto.port==null ) addressto.port = 443; else addressto.port = Number(addressto.port);

     if(addressto.domain==epicbox_domain && addressto.port ===epicbox_port){
            
		    let signed_payload = {str: json.str, challenge: chall, signature: json.signature}
        signed_payload = JSON.stringify(signed_payload)
        rabbitconn.createChannel(function(error1, cha1) {
            if (error1) {
                throw error1;
            }
		        cha1.assertQueue(addressto.publicKey, {durable:true, expires:86400000})
            let buf = Buffer.from(signed_payload)
            let epicboxreplyto = json.from

            // here stored slate in RabbitMq - here is added messageId which is used in ver. 2.0.0 
            let result = cha1.sendToQueue(addressto.publicKey, buf, { headers:{durable:true, 'epicbox-reply-to': epicboxreplyto, 'x-expires': 86400000, 'content-length':buf.length},  expiration:86400000, messageId:uid(32)});
            if(result) { 
             console.log("wrote to rabbit" );
             ws.send(JSON.stringify({type:"Ok"}));

            } else ws.send(JSON.stringify({type:"Error", kind:"Slate send error", description:"Slate problem"}));
        })
             
      } else {
        // connect by wss to other epicbox
        // when received Challange send by Message PostSlate Slate received from wallet.
        //
        //
		    sock = new WebSocket("wss://"+addressto.domain+":"+addressto.port)
        sock.on('error', console.error)
        sock.on('open', ()=>{console.log("Connect "+addressto.domain+":"+addressto.port)})
        sock.on('message',(mes)=>{
                	try{
				                ames = JSON.parse(mes)
                        if(ames.type=="Challenge") {
                            let reqqq = {type:"PostSlate", from:json.from, to:json.to, str:json.str, signature:json.signature}
                            sock.send(JSON.stringify(reqqq))
                            console.log("Send to wss://"+addressto.domain+":"+addressto.port)
			                  }
                        if(ames.type=="Ok") {
                         console.log("Sent correct to wss://"+addressto.domain+":"+addressto.port)
                          ws.send(JSON.stringify({type:"Ok"}));                
                        } 
		          
                  } catch(ee){
				            console.error(ee)
                    ws.send(JSON.stringify({type:"Error", kind:"Slate send error remote server", description:"Slate problem remote server"}));
                  }
        })
      }


}


//
//  function warking in interval repeted in 3 sec. after finish loop
//  it check all connected websockets to epicbox and if they are in Subscribe mode check if new Slate are waitng for it
//  if new slate is ... when send it.
//  check if wallet use 2.0.0 version 
//
function forInterval(){
    clearInterval(interval)
    wss.clients.forEach(function each(client) {
      if (client.readyState === 1 && client.queueforsubscribe!=null) {
        try {
            //console.log("try check and send ", client.queueforsubscribe)
                  client.channelforsubscribe.get(client.queueforsubscribe, {noAck:false}, (err, msgrabbit)=>{
            if(msgrabbit!=false && err==null) {
             console.log("try send ", client.queueforsubscribe)

              let fromrabbit = JSON.parse(msgrabbit.content.toString("utf8"))
              let answer= {}
              answer.type="Slate"
              answer.from = msgrabbit.properties.headers["epicbox-reply-to"]
              answer.str = fromrabbit.str
              answer.signature = fromrabbit.signature
              answer.challenge = fromrabbit.challenge
            
              let answerstr = null

              if(client.epicboxver == "2.0.0" && msgrabbit.properties.hasOwnProperty("messageId")){
              

                            let messageid = msgrabbit.properties.messageId                           
              
                              answer.epicboxmsgid = messageid
                              answer.ver = json.ver
                              answerstr = JSON.stringify(answer)
                                                            
                              
                              client.send(answerstr)  

                            

              } else {

                answerstr = JSON.stringify(answer)

                client.send(answerstr)

                client.channelforsubscribe.ack(msgrabbit)
              }

            } else {
             // console.log("msgrabbit ", msgrabbit)
             //console.log("Error ", err)
            }

            })
        } catch(err){
          console.log(err)
        }
      }
    });
    interval = setInterval( forInterval, 3000);

}


//
// main starting function
//
async function main() {
  
  amqplib.connect(rabbitmqaddress, (err, conn) => {
  if (err) throw err;
   rabbitconn = conn 
   server.listen(localepicboxserviceport)
   
    interval = setInterval( forInterval, 5000);

  })

  return "Epicbox ready to work.";

}


main()
  .then(console.log)
  .catch(console.error)

// That's all
// It is one day created software and seven days finding bugs :)))
// If you has suggestion or something is starnge for you simple ask me on keybase or telegram
// Thank you for reading. Sorry my English.


