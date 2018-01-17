const fs = require("fs");

const Pathfinder = global.Pathfinder;
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;
const Logger = require(Pathfinder.absPathInSrcFolder("utils/logger.js")).Logger;
const isNull = require(Pathfinder.absPathInSrcFolder("utils/null.js")).isNull;
let DbConnection = require(Pathfinder.absPathInSrcFolder("/kb/db.js")).DbConnection;

const initVirtuoso = function (app, callback)
{
    Logger.log_boot_message("Initializing Virtuoso Connection...");

    let db = new DbConnection(
        Config.db.default.graphHandle,
        Config.virtuosoHost,
        Config.virtuosoPort,
        Config.virtuosoISQLPort,
        Config.virtuosoAuth.user,
        Config.virtuosoAuth.password,
        Config.maxSimultaneousConnectionsToDb,
        Config.dbOperationTimeout
    );

    db.create(function (err, db)
    {
        if (isNull(err))
        {
            if (isNull(db))
            {
                return callback("[ERROR] Unable to connect to graph database running on " + Config.virtuosoHost + ":" + Config.virtuosoPort);
            }
            Logger.log_boot_message("Connected to graph database running on " + Config.virtuosoHost + ":" + Config.virtuosoPort);

            // set default connection. If you want to add other connections, add them in succession.
            Config.db.default.connection = db;

            return callback(null);
        }
        callback("[ERROR] Error connecting to graph database running on " + Config.virtuosoHost + ":" + Config.virtuosoPort);
        Logger.log("error", JSON.stringify(err));
        Logger.log("error", JSON.stringify(db));
    });
};

module.exports.initVirtuoso = initVirtuoso;
