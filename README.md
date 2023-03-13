# epicboxnodejs
Epicbox version on nodejs with elements of rust and adopt changes in epicbox protocole

## Setup
- install rust ver 1.6
* you must have working one instance RabbitMQ
+ RabbitMQ Plugin stomp (https://www.rabbitmq.com/stomp.html) rabbitmq
+ change ports and paths in app.js file, try read description to understand how it works

## Compilation epicboxlib
- go to epicboxlib folder
+ run cargo update
+ run cargo build --release
+ if problems install all libraries which need epic-wallet setup - look at github EpicCash epic-wallet

## Prepare nodejs
- return to main folder where is package.json file
+ use nodejs v18.14.2 ( use it ) ( mvw can help: mvn use v18.14.2 )
+ node update

## Start epicbox
+ node app

## Nginx setup example ( you can do it like you prefer )
