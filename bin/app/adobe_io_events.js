(function () {
    var fs = require("fs");
    var path = require("path");
    var splunkjs = require("splunk-sdk");
    var request = require("request");
    var Async = splunkjs.Async;
    var ModularInputs = splunkjs.ModularInputs;
    var Logger = ModularInputs.Logger;
    var Event = ModularInputs.Event;
    var Scheme = ModularInputs.Scheme;
    var Argument = ModularInputs.Argument;
    var utils = ModularInputs.utils;
    var jwt = require('jsonwebtoken');


    // Create easy to read date format.
    function getDisplayDate(date) {
        var monthStrings = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul",
            "Aug", "Sep", "Oct", "Nov", "Dec"
        ];

        date = new Date(date);

        var hours = date.getHours();
        if (hours < 10) {
            hours = "0" + hours.toString();
        }
        var mins = date.getMinutes();
        if (mins < 10) {
            mins = "0" + mins.toString();
        }

        return monthStrings[date.getMonth()] + " " + date.getDate() + ", " +
            date.getFullYear() + " - " + hours + ":" + mins + " " +
            (date.getUTCHours() < 12 ? "AM" : "PM");
    }

    function getAccessToken(param, callback) {
        var api_key = param.api_key;
        var technical_account_id = param.technical_account_id;
        var org_id = param.org_id;
        var client_secret = param.client_secret;
        var private_key = param.private_key.replace("KEY-----", "KEY-----\n").replace("-----END", "\n-----END").toString('ascii');
        var access_token = "";


        var aud = "https://ims-na1.adobelogin.com/c/" + api_key;

        var jwtPayload = {
            "exp": Math.round(87000 + Date.now() / 1000),
            "iss": org_id,
            "sub": technical_account_id,
            "https://ims-na1.adobelogin.com/s/ent_adobeio_sdk": true,
            "aud": aud
        };

        jwt.sign(jwtPayload, private_key, {algorithm: 'RS256'}, function (err, token) {
            var accessTokenOptions = {
                uri: 'https://ims-na1.adobelogin.com/ims/exchange/jwt/',
                headers: {
                    'content-type': 'multipart/form-data',
                    'cache-control': 'no-cache'
                },
                formData: {
                    client_id: api_key,
                    client_secret: client_secret,
                    jwt_token: token
                }
            };

            request.post(accessTokenOptions, function (err, res, body) {
                if (err) {
                    Logger.error(err);
                }

                if (JSON.parse(body).access_token) {
                    access_token = JSON.parse(body).access_token;

                    callback(access_token);
                }

            });

        });

    }

    exports.getScheme = function () {
        var scheme = new Scheme("Adobe I/O Events");

        scheme.description = "Streams Adobe I/O Events for the specified integration.";
        scheme.useExternalValidation = true;
        scheme.useSingleInstance = false; // Set to false so an input can have an optional interval parameter.

        scheme.args = [
            new Argument({
                name: "endpoint",
                dataType: Argument.dataTypeString,
                description: "Jouranling API Endpoint from console.adobe.io->Integration->Event Details->Journaling",
                requiredOnCreate: true,
                requiredOnEdit: false
            }),
            new Argument({
                name: "api_key",
                dataType: Argument.dataTypeString,
                description: "API KEY (Client ID) from console.adobe.io->Integration->Overview",
                requiredOnCreate: true,
                requiredOnEdit: false
            }),
            new Argument({
                name: "technical_account_id",
                dataType: Argument.dataTypeString,
                description: "Technical account ID from console.adobe.io->Integration->Overview",
                requiredOnCreate: true,
                requiredOnEdit: false
            }),
            new Argument({
                name: "org_id",
                dataType: Argument.dataTypeString,
                description: "Organization ID from console.adobe.io->Integration->Overview",
                requiredOnCreate: true,
                requiredOnEdit: false
            }),
            new Argument({
                name: "client_secret",
                dataType: Argument.dataTypeString,
                description: "Client Secret from console.adobe.io->Integration->Overview",
                requiredOnCreate: true,
                requiredOnEdit: false
            }),
            new Argument({
                name: "private_key",
                dataType: Argument.dataTypeString,
                description: "Private key for the public certificate used for creating integration in console.adobe.io",
                requiredOnCreate: true,
                requiredOnEdit: false
            })
        ];

        return scheme;
    };

    exports.validateInput = function (definition, done) {

        var endpoint = definition.parameters.endpoint;
        var api_key = definition.parameters.api_key;

        getAccessToken(definition.parameters, function (token) {

            try {
                var journaling = {
                    uri: endpoint,
                    headers: {
                        'x-api-key': api_key,
                        'Authorization': 'Bearer ' + token
                    }
                };
                request.get(journaling, function (err, response, body) {
                    if (err)
                        done(err);

                    var res = JSON.parse(body);
                    if (res.events !== 'undefined' && res.events.length > 0) {
                        done();
                    }
                });
            } catch (e) {
                done(e);
            }

        });
    };

    exports.streamEvents = function (name, singleInput, eventWriter, done) {
        // Get the checkpoint directory out of the modular input's metadata.
        var checkpointDir = this._inputDefinition.metadata["checkpoint_dir"];

        var endpoint = singleInput.endpoint;
        var api_key = singleInput.api_key;

        var checkpointFilePath = path.join(checkpointDir, api_key + ".txt");
        // Set the temporary contents of the checkpoint file to an empty string
        var checkpointFileContents = "";
        var lastId = "";
        try {
            checkpointFileContents = utils.readFile("", checkpointFilePath);
        } catch (e) {
            // If there's an exception, assume the file doesn't exist
            // Create the checkpoint file with an empty string
            fs.appendFileSync(checkpointFilePath, "");
        }

        if (checkpointFileContents != "") {
            var lines = checkpointFileContents.toString('ascii').split('\n');
            if (lines.length > 1) {
                lastId = lines[lines.length - 2];
            }
        }


        getAccessToken(singleInput, function (token) {
            var alreadyIndexed = 0;
            var working = true;
            var event;


            Async.whilst(
                function () {
                    return working;
                },
                function (callback) {
                    try {
                        var finalEndpoint = endpoint;
                        if (lastId != undefined && lastId.trim() != "") {
                            finalEndpoint = endpoint + "?from=" + lastId;
                        }
                        var journaling = {
                            uri: finalEndpoint,
                            headers: {
                                'x-api-key': api_key,
                                'Authorization': 'Bearer ' + token
                            }
                        };


                        request.get(journaling, function (err, response, body) {
                            if (err) {
                                callback(err);
                                return;
                            }

                            var res = JSON.parse(body);

                            if (res.next !== 'undefined' && res.next == "") {
                                working = false;
                            }
                            else {
                                lastId = res.next;
                            }


                            var checkpointFileNewContents = "";
                            var errorFound = false;

                            try {
                                checkpointFileContents = utils.readFile("", checkpointFilePath);
                            } catch (e) {
                                // If there's an exception, assume the file doesn't exist
                                // Create the checkpoint file with an empty string
                                fs.appendFileSync(checkpointFilePath, "");
                            }


                            if (res.events !== 'undefined' && res.events.length > 0) {
                                for (var i = 0; i < res.events.length; i++) {
                                    //var time = new Date(res.events[i].event.createTime);

                                    // If the file exists and doesn't contain the sha, or if the file doesn't exist.
                                    if (checkpointFileContents.indexOf(res.events[i].event_id + "\n") < 0) {
                                        try {
                                            event = new Event({
                                                stanza: api_key,
                                                sourcetype: "adobe_io_events",
                                                data: res.events[i], // Have Splunk index our event data as JSON, if data is an object it will be passed through JSON.stringify()
                                                time: Date.parse(new Date())
                                                // Set the event timestamp to the time of the journaling.
                                            });
                                            eventWriter.writeEvent(event);

                                            checkpointFileNewContents += res.events[i].event_id + "\n"; // Append this event to the string we'll write at the end
                                            Logger.info(name, "Indexed a I/O Event with event_id: " + res.events[i].event_id);
                                        } catch (e) {
                                            errorFound = true;
                                            working = false; // Stop streaming if we get an error.
                                            Logger.error(name, e.message);
                                            fs.appendFileSync(checkpointFilePath, checkpointFileNewContents); // Write to the checkpoint file
                                            done(e);

                                            // We had an error, die.
                                            return;
                                        }
                                    } else {
                                        // The event has already been indexed
                                        alreadyIndexed++;
                                    }
                                }
                            }

                            fs.appendFileSync(checkpointFilePath, checkpointFileNewContents); // Write to the checkpoint file
                            if (alreadyIndexed > 0) {
                                Logger.info(name, "Skipped " + alreadyIndexed.toString() + " already indexed event from " + api_key);
                            }
                            alreadyIndexed = 0;
                            callback();
                        });
                    } catch (e) {
                        callback(e);
                    }
                },
                function (err) {
                    // We're done streaming.
                    done(err);
                }
            );

        });


    };
    ModularInputs.execute(exports, module);
})();