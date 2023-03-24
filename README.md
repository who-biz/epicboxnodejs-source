# epicboxnodejs
Epicbox version on nodejs with elements of rust and adopt changes in epicbox protocole.

Added app_mongo_many.js for run many isntances under one domain. Each instance need use the same mongo database, in all instances adopted fastsend method.
For fastsend method only one of instances must have in config_many.json set fast_send_master=true, slaves ips must be set in array fast_send_slaves.
All instances must have the same epicbox domain and epicbox port set ( correct to your used epicbox.domain ).

Instance with set fast_send_master = true can work like indepndet alone epicbox ( like preverious version app_mongo.js ).

For each instance so you must use diffirent config_many.json file ( set other local port, or fast_send_master = false etc. ) so to run epicbox use command:

node app_mongo_many.js config_many.json

And for next one:

node app_mongo_many.js config_many_slave1.json

Enjoy.