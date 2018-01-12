const async = require("async");

const Pathfinder = global.Pathfinder;
const Resource = require(Pathfinder.absPathInSrcFolder("models/resource.js")).Resource;
const Class = require(Pathfinder.absPathInSrcFolder("/models/meta/class.js")).Class;
const Elements = require(Pathfinder.absPathInSrcFolder("/models/meta/elements.js")).Elements;
const isNull = require(Pathfinder.absPathInSrcFolder("/utils/null.js")).isNull;
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;
const db = Config.getDBByID();

let StorageConfig = function (object)
{
    const self = this;

    const initObject = function()
    {
        self.addURIAndRDFType(object, "storageConfig", StorageConfig);
        StorageConfig.baseConstructor.call(self, object);

        self.copyOrInitDescriptors(object);

        if(isNull(self.ddr.created))
        {
            const now = new Date();
            self.ddr.created = now.toISOString();
        }

        return self;
    };

    if(!isNull(object.ddr) && object.ddr.hasStorageType === "b2drop")
    {
        if(!object.ddr.hasPassword || !object.ddr.hasUsername)
        {
            throw new Error("Invalid b2drop storage config when creating a storage configuration. Missing ddr.hasPassword or ddr.hasUsername in parameter object.");
        }
        else
        {
            initObject();
        }
    }
    else if(!isNull(object.ddr) && object.ddr.hasStorageType === "local")
    {
        initObject();

        if(isNull(self.ddr.hasUsername))
        {
            self.ddr.hasUsername = Config.defaultStorageConfig.username;
        }

        if(isNull(self.ddr.hasPassword))
        {
            self.ddr.hasPassword = Config.defaultStorageConfig.password;
        }

        if(isNull(self.ddr.hasHost))
        {
            self.ddr.hasHost = Config.defaultStorageConfig.host;
        }

        if(isNull(self.ddr.hasPort))
        {
            self.ddr.hasPort = Config.defaultStorageConfig.port;
        }

        if(isNull(self.ddr.hasPort))
        {
            self.ddr.hasCollectionName = Config.defaultStorageConfig.collectionName;
        }
    }
    else
    {
        throw new Error("Invalid storage type for creating a storage configuration: " + object.ddr.hasStorageType);
    }
}

StorageConfig.findByProject = function (projectUri, callback, customGraphUri)
{
    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;
    if (!isNull(projectUri))
    {
        const query =
            "SELECT ?configuration\n" +
            "FROM [0] \n" +
            "WHERE \n" +
            "{ \n" +
            "   ?configuration ddr:handlesStorageForProject [1] \n" +
            "} \n";

        db.connection.executeViaJDBC(query, [
            {
                type: Elements.types.resourceNoEscape,
                value: graphUri
            },
            {
                type: Elements.ontologies.ddr.handlesStorageForProject.type,
                value: projectUri
            }
        ], function (err, results)
        {
            if (isNull(err))
            {
                if (!isNull(results) && results instanceof Array)
                {
                    if (results.length > 0)
                    {
                        async.map(results, function (result, cb)
                        {
                            StorageConfig.findByUri(result.configuration, function (err, config)
                            {
                                cb(err, config);
                            });
                        });
                    }
                    else
                    {
                        callback(null, null);
                    }
                }
            }
            else
            {
                return callback(err, results);
            }
        });
    }
    else
    {
        callback(1, "Project Uri or Storage Type missing when retrieving a storage configuration.");
    }
};

StorageConfig.findByProjectAndType = function (projectUri, storageType, callback, customGraphUri)
{
    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;
    if (!isNull(projectUri) && !isNull(storageType))
    {
        const query =
            "SELECT ?configuration\n" +
            "FROM [0] \n" +
            "WHERE \n" +
            "{ \n" +
            "   ?configuration ddr:handlesStorageForProject [1] . \n" +
            "   ?configuration rdf:hasStorageType [2] . \n" +
            "} \n";

        db.connection.executeViaJDBC(query, [
            {
                type: Elements.types.resourceNoEscape,
                value: graphUri
            },
            {
                type: Elements.ontologies.ddr.handlesStorageForProject.type,
                value: projectUri
            },
            {
                type: Elements.ontologies.ddr.hasStorageType.type,
                value: storageType
            }
        ], function (err, results)
        {
            if (isNull(err))
            {
                if (!isNull(results) && results instanceof Array)
                {
                    if (results.length === 1)
                    {
                        StorageConfig.findByUri(results[0].configuration, function (err, config)
                        {
                            callback(err, config);
                        });
                    }
                    else if (results.length === 0)
                    {
                        callback(null, null);
                    }
                    else
                    {
                        const msg = "There are more than one storage configuration of type " + storageType + " for project " + projectUri + " !";
                        Logger.log("error", msg);
                        callback(1, msg);
                    }
                }
            }
            else
            {
                return callback(err, results);
            }
        });
    }
    else
    {
        callback(1, "Project Uri or Storage Type missing when retrieving a storage configuration.");
    }
};

StorageConfig = Class.extend(StorageConfig, Resource, "ddr:StorageConfig");

module.exports.StorageConfig = StorageConfig;

