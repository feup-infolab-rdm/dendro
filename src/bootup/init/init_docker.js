const fs = require("fs");

const Pathfinder = global.Pathfinder;
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;
const Logger = require(Pathfinder.absPathInSrcFolder("utils/logger.js")).Logger;
const isNull = require(Pathfinder.absPathInSrcFolder("/utils/null.js")).isNull;
const DockerCheckpointManager = require(Pathfinder.absPathInSrcFolder("utils/docker/snapshot_manager.js")).DockerCheckpointManager;

const initDockerContainers = function (app, callback)
{
    if (Config.docker.active)
    {
        DockerCheckpointManager.startAllContainers(function (err, results)
        {
            if (!isNull(err))
            {
                const msg = "Unable to start docker containers!" + JSON.stringify(results);
                Logger.log("error", msg);
            }
            callback(err);
        });
    }
    else
    {
        callback(null);
    }
};

module.exports.initDockerContainers = initDockerContainers;