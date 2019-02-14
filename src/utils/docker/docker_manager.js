const fs = require("fs");
const path = require("path");
const async = require("async");
const _ = require("underscore");

const rlequire = require("rlequire");
const Config = rlequire("dendro", "src/models/meta/config.js").Config;
const isNull = rlequire("dendro", "src/utils/null.js").isNull;
const Logger = rlequire("dendro", "src/utils/logger.js").Logger;

const childProcess = require("child_process");
const startContainersScript = rlequire.absPathInApp("dendro", "conf/scripts/docker/start_containers.sh");
const stopContainersScript = rlequire.absPathInApp("dendro", "conf/scripts/docker/stop_containers.sh");
const createCheckpointScript = rlequire.absPathInApp("dendro", "conf/scripts/docker/create_checkpoint.sh");
const restoreCheckpointScript = rlequire.absPathInApp("dendro", "conf/scripts/docker/restore_checkpoint.sh");
const restartContainersScript = rlequire.absPathInApp("dendro", "conf/scripts/docker/restart_containers.sh");
const nukeAndRebuildScript = rlequire.absPathInApp("dendro", "conf/scripts/docker/nuke_and_rebuild.sh");
const checkIfCheckpointExistsScript = rlequire.absPathInApp("dendro", "conf/scripts/docker/check_if_checkpoint_exists.sh");

const DockerManager = function ()
{
};

DockerManager.defaultOrchestra = "dendro";
DockerManager.runningOrchestras = {};

const logEverythingFromChildProcess = function (childProcess)
{
    childProcess.stdout.on("data", function (data)
    {
        Logger.log("info", data);
    });

    childProcess.stderr.on("data", function (data)
    {
        Logger.log("warn", data);
    });

    childProcess.on("exit", function (code)
    {
        if (!code)
        {
            Logger.log("info", "Process " + childProcess.cmd + " exited successfully (code 0). ");
        }
        else
        {
            Logger.log("warn", "Process " + childProcess.cmd + " exited with non-zero exit code (code " + code + ".");
        }
    });
};

DockerManager.stopAllContainers = function (callback)
{
    DockerManager.stopOrchestra(DockerManager.defaultOrchestra, callback);
};

DockerManager.startAllContainers = function (callback)
{
    DockerManager.startOrchestra(DockerManager.defaultOrchestra, callback);
};

DockerManager.checkpointExists = function (checkpointName, callback)
{
    if (isNull(checkpointName))
    {
        callback(null, false);
    }
    else
    {
        if (Config.docker && Config.docker.active)
        {
            childProcess.exec(`/bin/bash -c "${checkIfCheckpointExistsScript} ${checkpointName}"`, {
                cwd: rlequire.getRootFolder("dendro"),
                stdio: [0, 1, 2]
            }, function (err, result)
            {
                if (isNull(err))
                {
                    callback(null, true);
                }
                else
                {
                    callback(null, false);
                }
            });
        }
        else
        {
            callback(null, false);
        }
    }
};

DockerManager.createCheckpoint = function (checkpointName, callback)
{
    if (Config.docker && Config.docker.active)
    {
        Logger.log("Creating Docker checkpoint " + checkpointName);
        DockerManager.checkpointExists(checkpointName, function (err, exists)
        {
            if (isNull(err))
            {
                if (!exists)
                {
                    childProcess.exec(`/bin/bash -c "${createCheckpointScript} ${checkpointName}"`, {
                        cwd: rlequire.getRootFolder("dendro"),
                        stdio: [0, 1, 2]
                    }, function (err, result)
                    {
                        if (isNull(err))
                        {
                            Logger.log("Saved checkpoint with name " + checkpointName);
                        }
                        callback(err, result);
                    });
                }
                else
                {
                    Logger.log("Checkpoint " + checkpointName + " already exists.");
                    callback(null);
                }
            }
            else
            {
                callback(err, exists);
            }
        });
    }
    else
    {
        callback(null);
    }
};

DockerManager.restoreCheckpoint = function (checkpointName, callback)
{
    if (Config.docker && Config.docker.active)
    {
        Logger.log("Restoring Docker checkpoint " + checkpointName);
        DockerManager.checkpointExists(checkpointName, function (err, exists)
        {
            if (!err)
            {
                if (exists)
                {
                    childProcess.exec(`/bin/bash -c "${restoreCheckpointScript} ${checkpointName}"`, {
                        cwd: rlequire.getRootFolder("dendro"),
                        stdio: [0, 1, 2]
                    }, function (err, result)
                    {
                        if (isNull(err))
                        {
                            Logger.log("Restored Docker checkpoint with name " + checkpointName + " of Docker containers.");
                            callback(err, true);
                        }
                        else
                        {
                            callback(err, false);
                        }
                    });
                }
                else
                {
                    const msg = "Checkpoint " + checkpointName + " does not exist!";
                    Logger.log("error", msg);
                    callback(null, false);
                }
            }
            else
            {
                callback(err, false);
            }
        });
    }
    else
    {
        callback(null, false);
    }
};

DockerManager.nukeAndRebuild = function (onlyOnce, callback)
{
    if (Config.docker && Config.docker.active)
    {
        const performOperation = function ()
        {
            Logger.log("Rebuilding all Docker containers.");

            if (process.env.NODE_ENV === "test")
            {
                childProcess.execSync(`/bin/bash -c "${nukeAndRebuildScript}"`, {
                    cwd: rlequire.getRootFolder("dendro"),
                    stdio: [0, 1, 2]
                });
            }
            else
            {
                childProcess.execSync(`docker-compose rm -s"`, {
                    cwd: rlequire.getRootFolder("dendro"),
                    stdio: [0, 1, 2]
                });
            }
        };

        if (onlyOnce)
        {
            if (!DockerManager._nukedOnce)
            {
                performOperation();
                DockerManager._nukedOnce = true;
            }

            callback(null);
        }
        else
        {
            performOperation(callback);
        }
    }
};

DockerManager.restartContainers = function (onlyOnce)
{
    Logger.log("Restarting all Docker containers.");
    if (Config.docker && Config.docker.active)
    {
        const performOperation = function ()
        {
            childProcess.execSync(`/bin/bash -c "${restartContainersScript}"`, {
                cwd: rlequire.getRootFolder("dendro"),
                stdio: [0, 1, 2]
            });

            Logger.log("Restarted all containers");
            DockerManager._restartedOnce = true;
        };

        if (onlyOnce)
        {
            if (!DockerManager._restartedOnce)
            {
                performOperation();
            }
        }
        else
        {
            performOperation();
        }
        Logger.log("Restarted all containers.");
    }
};

DockerManager.forAllOrchestrasDo = function (lambda, callback)
{
    const dir = require("node-dir");
    const orchestrasDir = path.resolve(rlequire.getRootFolder("dendro"), "orchestras");
    dir.files(
        orchestrasDir,
        "dir",
        function (err, subdirs)
        {
            async.map(subdirs, function (subdir, singleLambdaCallback)
            {
                lambda(subdir, singleLambdaCallback);
            }, callback);
        },
        {
            recursive: false
        });
};

DockerManager.destroyAllOrchestras = function (callback)
{
    DockerManager.forAllOrchestrasDo(function (subdir, callback)
    {
        const dockerSubProcess = childProcess.exec("docker-compose down", {
            cwd: subdir
        }, function (err, result)
        {
            callback(err, result);
        });

        logEverythingFromChildProcess(dockerSubProcess);
    }, callback);
};

DockerManager.fetchAllOrchestras = function (callback, onlyOnce)
{
    if (!onlyOnce || onlyOnce && isNull(DockerManager.__fetchedAllImages))
    {
        DockerManager.forAllOrchestrasDo(function (subdir, callback)
        {
            const dockerSubProcess = childProcess.exec("docker-compose pull", {
                cwd: subdir
            }, callback);

            logEverythingFromChildProcess(dockerSubProcess);
        }, callback);
    }
    else
    {
        callback();
    }
};

DockerManager.requireOrchestras = function (orchestraName, req, res, next)
{
    DockerManager.startOrchestra(orchestraName, function (err, result)
    {
        next();
    });
};

DockerManager.startOrchestra = function (orchestraName, callback)
{
    if (Config.docker && Config.docker.active)
    {
        if (orchestraName instanceof Array)
        {
            async.mapSeries(
                orchestraName,
                function (singleOrchestraName, cb2)
                {
                    DockerManager.startOrchestra(singleOrchestraName, function (err, result)
                    {
                        if (!isNull(err))
                        {
                            Logger.log("error", "Error occurred while starting orchestra " + singleOrchestraName);
                            Logger.log("error", err.message);
                        }

                        cb2(err, result);
                    });
                },
                function (err, results)
                {
                    callback(err, results);
                });
        }
        else
        {
            Logger.log("Starting all Docker containers in orchestra " + orchestraName);
            Logger.log("info", "PLEASE WAIT! If after 10 minutes without heavy CPU activity please press Ctrl+C and try again.");

            let dockerSubProcess;
            if (process.env.NODE_ENV === "test" && orchestraName === DockerManager.defaultOrchestra)
            {
                dockerSubProcess = childProcess.exec(`/bin/bash -c "${startContainersScript}"`, {
                    cwd: rlequire.getRootFolder("dendro"),
                    stdio: [0, 1, 2]
                }, function (err, result)
                {
                    Logger.log("Started all containers");
                    callback(err, result);
                });
                logEverythingFromChildProcess(dockerSubProcess);
            }
            else
            {
                if (isNull(DockerManager.runningOrchestras[orchestraName]))
                {
                    const dockerComposeFolder = path.resolve(rlequire.getRootFolder("dendro"), "./orchestras/" + orchestraName);
                    dockerSubProcess = childProcess.exec("docker-compose up -d --no-recreate", {
                        cwd: dockerComposeFolder
                    }, function (err, result)
                    {
                        Logger.log("Started all containers in orchestra " + orchestraName);

                        if (!isNull(err))
                        {
                            if (err.message)
                            {
                                const matchName = err.message.match(/ERROR: for .* Cannot create container for service .* Conflict. The container name .* is already in use by container .* You have to remove \(or rename\) that container to be able to reuse that name./);

                                if (!isNull(matchName) && matchName.length > 0)
                                {
                                    DockerManager.runningOrchestras[orchestraName] = {
                                        id: orchestraName,
                                        dockerComposeFolder: dockerComposeFolder
                                    };

                                    // TODO we ignore errors because in many cases a container with that name is already running.
                                    // TODO Need a way to detect and manage containers witht the same names...
                                    callback(null, result);
                                }
                                else
                                {
                                    callback(err, result);
                                }
                            }
                            else
                            {
                                callback(err, result);
                            }
                        }
                        else
                        {
                            DockerManager.runningOrchestras[orchestraName] = {
                                id: orchestraName,
                                dockerComposeFolder: dockerComposeFolder
                            };
                            callback(err, result);
                        }
                    });
                    logEverythingFromChildProcess(dockerSubProcess);
                }
                else
                {
                    Logger.log("debug", "Containers in orchestra " + orchestraName + " are already running.");
                    callback(null, null);
                }
            }
        }
    }
    else
    {
        callback(null);
    }
};

DockerManager.stopOrchestra = function (orchestraName, callback)
{
    if (Config.docker && Config.docker.active)
    {
        if (orchestraName instanceof Array)
        {
            async.mapSeries(
                orchestraName,
                function (singleOrchestraName, callback)
                {
                    DockerManager.startOrchestra(singleOrchestraName, function (err, result)
                    {
                        if (!isNull(err))
                        {
                            Logger.log("error", "Error occurred while stopping orchestra " + singleOrchestraName);
                            Logger.log("error", err.message);
                        }

                        callback(err, result);
                    });
                },
                function (err, results)
                {
                    callback(err, results);
                });
        }
        else
        {
            Logger.log("Stopping all Docker containers in orchestra " + orchestraName);
            Logger.log("warn", "If it takes long in the first boot PLEASE WAIT! If after 10 minutes without heavy CPU activity please press Ctrl+C and try again.");

            let dockerSubProcess;

            if (process.env.NODE_ENV === "test" && orchestraName === DockerManager.defaultOrchestra)
            {
                dockerSubProcess = childProcess.exec(`/bin/bash -c "${stopContainersScript}"`, {
                    cwd: rlequire.getRootFolder("dendro"),
                    stdio: [0, 1, 2]
                }, function (err, result)
                {
                    Logger.log("Stopped all containers");
                    callback(err, result);
                });
            }
            else
            {
                if (!isNull(DockerManager.runningOrchestras[orchestraName]))
                {
                    dockerSubProcess = childProcess.exec("docker-compose down", {
                        cwd: path.resolve(rlequire.getRootFolder("dendro"), "./orchestras/" + orchestraName),
                        stdio: [0, 1, 2]
                    }, function (err, result)
                    {
                        if (isNull(err))
                        {
                            DockerManager.runningOrchestras[orchestraName] = null;
                        }

                        Logger.log("Started all containers in orchestra " + orchestraName);
                        callback(err, result);
                    });
                }
                else
                {
                    Logger.log("debug", "Containers in orchestra " + orchestraName + " are not running, no need to stop them.");
                    callback(null, null);
                }
            }

            logEverythingFromChildProcess(dockerSubProcess);
        }
    }
    else
    {
        callback(null);
    }
};

DockerManager.stopAllOrchestras = function (callback)
{
    async.mapSeries(Object.keys(DockerManager.runningOrchestras), function (orchestra, callback)
    {
        DockerManager.stopOrchestra(orchestra, callback);
    },
    function (err, results)
    {
        callback(err, results);
    });
};

module.exports.DockerManager = DockerManager;
