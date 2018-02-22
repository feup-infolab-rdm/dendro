const async = require("async");
const fs = require("fs");
const path = require("path");
const _ = require("underscore");

const Pathfinder = global.Pathfinder;
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;
const isNull = require(Pathfinder.absPathInSrcFolder("/utils/null.js")).isNull;

const childProcess = require("child_process");
const startContainersScript = Pathfinder.absPathInApp("/conf/scripts/docker/start_containers.sh");
const stopContainersScript = Pathfinder.absPathInApp("/conf/scripts/docker/stop_containers.sh");
const createCheckpointScript = Pathfinder.absPathInApp("/conf/scripts/docker/create_checkpoint.sh");
const restoreCheckpointScript = Pathfinder.absPathInApp("/conf/scripts/docker/restore_checkpoint.sh");
const restartContainersScript = Pathfinder.absPathInApp("/conf/scripts/docker/restart_containers.sh");
const nukeAndRebuildScript = Pathfinder.absPathInApp("/conf/scripts/docker/nuke_and_rebuild.sh");
const dataFolder = Pathfinder.absPathInApp("/data");

const bufferToString = function (buffer)
{
    const { StringDecoder } = require("string_decoder");
    const decoder = new StringDecoder("utf8");

    const cent = Buffer.from(buffer);
    return decoder.write(cent);
};

const DockerCheckpointManager = function ()
{
};

DockerCheckpointManager._checkpoints = {};

if (Config.docker.reuse_checkpoints)
{
    console.log("Checking out all Docker containers to see which can be reused...");
    const checkpointFolders = fs.readdirSync(dataFolder).filter(function (file)
    {
        return fs.statSync(path.join(dataFolder, file)).isDirectory();
    });

    _.map(checkpointFolders, function (folderName)
    {
        DockerCheckpointManager._checkpoints[folderName] = true;
    });
}

DockerCheckpointManager.stopAllContainers = function ()
{
    if (Config.docker && Config.docker.active)
    {
        console.log("Stopping all Docker containers.");
        const output = childProcess.execSync(`/bin/bash -c "${stopContainersScript}"`, {
            cwd: Pathfinder.appDir
        });

        console.log(bufferToString(output));
        return bufferToString(output);
    }
};

DockerCheckpointManager.startAllContainers = function ()
{
    if (Config.docker && Config.docker.active)
    {
        console.log("Starting all Docker containers.");
        const output = childProcess.execSync(`/bin/bash -c "${startContainersScript}"`, {
            cwd: Pathfinder.appDir
        });

        console.log(bufferToString(output));
        return bufferToString(output);
    }
};

DockerCheckpointManager.checkpointExists = function (checkpointName)
{
    if (Config.docker && Config.docker.active)
    {
        return (!isNull(DockerCheckpointManager._checkpoints[checkpointName]));
    }
};

DockerCheckpointManager.createCheckpoint = function (checkpointName)
{
    if (Config.docker && Config.docker.active)
    {
        console.log("Creating Docker checkpoint " + checkpointName);
        if (isNull(DockerCheckpointManager._checkpoints[checkpointName]))
        {
            const output = childProcess.execSync(`/bin/bash -c "${createCheckpointScript} ${checkpointName}"`, {
                cwd: Pathfinder.appDir
            });

            console.log(bufferToString(output));
            console.log("Saved checkpoint with name " + checkpointName);
            DockerCheckpointManager._checkpoints[checkpointName] = true;

            return bufferToString(output);
        }
    }
};

DockerCheckpointManager.restoreCheckpoint = function (checkpointName)
{
    if (Config.docker && Config.docker.active)
    {
        console.log("Restoring Docker checkpoint " + checkpointName);
        if (DockerCheckpointManager._checkpoints[checkpointName])
        {
            const output = childProcess.execSync(`/bin/bash -c "${restoreCheckpointScript}" ${checkpointName}`, {
                cwd: Pathfinder.appDir
            });

            console.log(bufferToString(output));
            console.log("Restored Docker checkpoint with name " + checkpointName + " of Docker containers.");
            return true;
        }

        return false;
    }
};

DockerCheckpointManager.deleteAll = function (onlyOnce, evenCurrentState)
{
    if (Config.docker && Config.docker.active)
    {
        console.log("Deleting all Docker containers.");
        const performOperation = function ()
        {
            const del = require("del");
            if (evenCurrentState)
            {
                del.sync([dataFolder + "/*"], {force: true});
            }
            else
            {
                del.sync([dataFolder + "/*", "!" + dataFolder + "/current"], {force: true});
            }
        };

        if (onlyOnce)
        {
            if (!DockerCheckpointManager._deletedOnce)
            {
                performOperation();
                DockerCheckpointManager._deletedOnce = true;
            }
        }
        else
        {
            performOperation();
        }
    }
};

DockerCheckpointManager.nukeAndRebuild = function (onlyOnce)
{
    if (Config.docker && Config.docker.active)
    {
        console.log("Rebuilding all Docker containers.");
        const performOperation = function ()
        {
            const output = childProcess.execSync(`/bin/bash -c "${nukeAndRebuildScript}"`, {
                cwd: Pathfinder.appDir
            });

            console.log(bufferToString(output));
            return bufferToString(output);
        };

        if (onlyOnce)
        {
            if (!DockerCheckpointManager._nukedOnce)
            {
                performOperation();
                DockerCheckpointManager._nukedOnce = true;
            }
        }
        else
        {
            performOperation();
        }

        console.log("Nuked and rebuilt all containers.");
    }
};

DockerCheckpointManager.restartAllContainers = function (onlyOnce)
{
    console.log("Restarting all Docker containers.");
    if (Config.docker && Config.docker.active)
    {
        const performOperation = function ()
        {
            const output = childProcess.execSync(`/bin/bash -c "${restartContainersScript}"`, {
                cwd: Pathfinder.appDir
            });

            console.log(bufferToString(output));
            return bufferToString(output);
        };

        if (onlyOnce)
        {
            if (!DockerCheckpointManager._restartedOnce)
            {
                performOperation();
                DockerCheckpointManager._restartedOnce = true;
            }
        }
        else
        {
            performOperation();
        }
        console.log("Restarted all containers.");
    }
};

module.exports.DockerCheckpointManager = DockerCheckpointManager;
