// complies with the NIE ontology (see http://www.semanticdesktop.org/ontologies/2007/01/19/nie/#InformationElement)

const path = require("path");
const async = require("async");
const _ = require("underscore");
const Pathfinder = global.Pathfinder;
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;

const isNull = require(Pathfinder.absPathInSrcFolder("/utils/null.js")).isNull;
const Class = require(Pathfinder.absPathInSrcFolder("/models/meta/class.js")).Class;
const DbConnection = require(Pathfinder.absPathInSrcFolder("/kb/db.js")).DbConnection;
const Cache = require(Pathfinder.absPathInSrcFolder("/kb/cache/cache.js")).Cache;
const Resource = require(Pathfinder.absPathInSrcFolder("/models/resource.js")).Resource;
const Elements = require(Pathfinder.absPathInSrcFolder("/models/meta/elements.js")).Elements;
const Logger = require(Pathfinder.absPathInSrcFolder("utils/logger.js")).Logger;

const db = Config.getDBByID();

function InformationElement (object)
{
    const self = this;
    self.addURIAndRDFType(object, "information_element", InformationElement);
    InformationElement.baseConstructor.call(this, object);

    if (!isNull(object.nie))
    {
        if (!isNull(object.nie.isLogicalPartOf))
        {
            self.nie.isLogicalPartOf = object.nie.isLogicalPartOf;
        }

        if (!isNull(object.nie.title))
        {
            self.nie.title = object.nie.title;
        }
    }

    return self;
}

InformationElement.prototype.getParent = function (callback)
{
    const self = this;

    const query =
        "SELECT ?parent_folder ?parent_project \n" +
        "FROM [0] \n" +
        "WHERE \n" +
        "{ \n" +
        " { \n" +
        "[1] nie:isLogicalPartOf ?parent_folder. \n" +
        " ?parent_folder rdf:type nfo:Folder. \n" +
        " } \n" +
        " UNION " +
        " { " +
        "[1] nie:isLogicalPartOf ?parent_project. \n" +
        " ?parent_project rdf:type ddr:Project. \n" +
        " } \n" +
        "} ";

    db.connection.executeViaJDBC(query,
        [
            {
                type: Elements.types.resourceNoEscape,
                value: db.graphUri
            },
            {
                type: Elements.types.resource,
                value: self.uri
            }
        ],
        function (err, results)
        {
            if (isNull(err))
            {
                if (results instanceof Array)
                {
                    if (results.length === 1)
                    {
                        const result = results[0];
                        if (!isNull(results[0].parent_folder))
                        {
                            result.uri = result.parent_folder;
                            const Folder = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/folder.js")).Folder;
                            let parent = new Folder(result);
                            return callback(null, parent);
                        }
                        else if (!isNull(result[0].parent_project))
                        {
                            result.uri = result.parent_project;
                            const Project = require(Pathfinder.absPathInSrcFolder("/models/project.js")).Project;
                            let parent = new Project(result);
                            return callback(null, parent);
                        }

                        return callback(1, "There was an error calculating the parent of resource " + self.uri);
                    }
                    else if (results.length === 0)
                    {
                        return callback(null, "There is no parent of " + self.uri);
                    }

                    return callback(1, "ERROR : There is more than one parent to " + self.uri + " !");
                }

                return callback(1, "Invalid result set or no parent found when querying for the parent of" + self.uri);
            }

            return callback(1, "Error reported when querying for the parent of" + self.uri + " . Error was ->" + results);
        }
    );
};

InformationElement.prototype.calculateHumanReadableUri = function (callback)
{
    const self = this;

    const getPathTitles = function (callback)
    {
        /**
         *   Note the PLUS sign (+) on the nie:isLogicalPartOf+ of the query below.
         *    (Recursive querying through inference).
         *   @type {string}
         */
        const query =
            "SELECT ?uri \n" +
            "FROM [0] \n" +
            "WHERE \n" +
            "{ \n" +
            "   [1] nie:isLogicalPartOf+ ?uri. \n" +
            "   ?uri rdf:type ddr:Resource. \n" +
            "   ?uri rdf:type nfo:Folder \n" +
            "   ?uri nie:title ?title \n" +
            "   FILTER NOT EXISTS \n" +
            "   { \n" +
            "       ?project ddr:rootFolder ?uri\n" +
            "   }\n" +
            "}\n ";

        db.connection.executeViaJDBC(query,
            [
                {
                    type: Elements.types.resourceNoEscape,
                    value: db.graphUri
                },
                {
                    type: Elements.types.resource,
                    value: self.uri
                }
            ],
            function (err, results)
            {
                if (isNull(err))
                {
                    if (results instanceof Array)
                    {
                        const titlesArray = _.map(results, function (result)
                        {
                            return result.title;
                        });

                        callback(null, titlesArray);
                    }
                    else
                    {
                        return callback(1, "Invalid result set or no parent PROJECT found when querying for the parent project of" + self.uri);
                    }
                }
                else
                {
                    return callback(1, "Error reported when querying for the parent PROJECT of" + self.uri + " . Error was ->" + results);
                }
            }
        );
    };

    const getOwnerProjectHandle = function (callback)
    {
        self.getOwnerProject(function (err, project)
        {
            callback(err, project.ddr.handle);
        });
    };

    getOwnerProjectHandle(function (err, handle)
    {
        getPathTitles(function (err, titles)
        {
            let newHumanReadableUri = [handle].concat(titles).concat([self.nie.title]).join("/");
            callback(null, newHumanReadableUri);
        });
    });
};

InformationElement.prototype.getAllParentsUntilProject = function (callback)
{
    const self = this;

    /**
     *   Note the PLUS sign (+) on the nie:isLogicalPartOf+ of the query below.
     *    (Recursive querying through inference).
     *   @type {string}
     */
    const query =
        "SELECT ?uri \n" +
        "FROM [0] \n" +
        "WHERE \n" +
        "{ \n" +
        "   [1] nie:isLogicalPartOf+ ?uri. \n" +
        "   ?uri rdf:type ddr:Resource. \n" +
        "   ?uri rdf:type nfo:Folder \n" +
        "   FILTER NOT EXISTS \n" +
        "   { \n" +
        "       ?project ddr:rootFolder ?uri\n" +
        "   }\n" +
        "}\n ";

    db.connection.executeViaJDBC(query,
        [
            {
                type: Elements.types.resourceNoEscape,
                value: db.graphUri
            },
            {
                type: Elements.types.resource,
                value: self.uri
            }
        ],
        function (err, result)
        {
            if (isNull(err))
            {
                if (result instanceof Array)
                {
                    const Folder = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/folder.js")).Folder;
                    async.mapSeries(result, function (result, callback)
                    {
                        Folder.findByUri(result.uri, function (err, parentFolder)
                        {
                            return callback(err, parentFolder);
                        });
                    }, callback);
                }
                else
                {
                    return callback(1, "Invalid result set or no parent PROJECT found when querying for the parent project of" + self.uri);
                }
            }
            else
            {
                return callback(1, "Error reported when querying for the parent PROJECT of" + self.uri + " . Error was ->" + result);
            }
        }
    );
};

InformationElement.prototype.getOwnerProject = function (callback)
{
    const self = this;

    /**
    *   Note the sign (*) on the nie:isLogicalPartOf* of the query below.
    *    (Recursive querying through inference).
    *   @type {string}
    */
    const query =
        "SELECT ?uri \n" +
        "FROM [0] \n" +
        "WHERE \n" +
        "{ \n" +
        "   [1] nie:isLogicalPartOf+ ?uri \n" +
        "   FILTER EXISTS { \n" +
        "       ?uri rdf:type ddr:Project \n" +
        "   }\n" +
        "} ";

    db.connection.executeViaJDBC(query,
        [
            {
                type: Elements.types.resourceNoEscape,
                value: db.graphUri
            },
            {
                type: Elements.types.resource,
                value: self.uri
            }
        ],
        function (err, result)
        {
            if (isNull(err))
            {
                if (result instanceof Array && result.length === 1)
                {
                    const Project = require(Pathfinder.absPathInSrcFolder("/models/project.js")).Project;
                    Project.findByUri(result[0].uri, function (err, project)
                    {
                        callback(err, project);
                    });
                }
                else
                {
                    return callback(1, "Invalid result set or no parent PROJECT found when querying for the parent project of" + self.uri);
                }
            }
            else
            {
                return callback(1, "Error reported when querying for the parent PROJECT of" + self.uri + " . Error was ->" + result);
            }
        }
    );
};

InformationElement.prototype.needsRenaming = function (callback, newTitle, parentUri)
{
    const self = this;
    const getParent = function (callback)
    {
        if (isNull(parentUri))
        {
            parentUri = self.nie.isLogicalPartOf;
        }
        const Folder = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/folder.js")).Folder;
        const Project = require(Pathfinder.absPathInSrcFolder("/models/project.js")).Project;

        Folder.findByUri(parentUri, function (err, parentFolder)
        {
            if (isNull(err))
            {
                if (parentFolder instanceof Folder)
                {
                    callback(err, parentFolder);
                }
                else
                {
                    Project.findByUri(parentUri, function (err, parentProject)
                    {
                        if (isNull(err))
                        {
                            if (parentProject instanceof Project)
                            {
                                callback(err, parentProject);
                            }
                            else
                            {
                                callback(true, "Error: Parent (with uri: " + parentUri + ") of :" + self.uri + " is neither a folder nor project");
                            }
                        }
                        else
                        {
                            callback(err, parentProject);
                        }
                    });
                }
            }
            else
            {
                callback(err, parentFolder);
            }
        });
    };

    const getChildrenOfParent = function (parent, callback)
    {
        parent.getLogicalParts(callback);
    };

    const renameIfChildExistsWithSameName = function (children, callback)
    {
        let shouldRename = false;
        if (isNull(newTitle))
        {
            newTitle = self.nie.title;
        }

        const childrenWithTheSameName = _.find(children, function (child)
        {
            // return child.nie.title === self.nie.title && child.uri !== self.uri && child.ddr.deleted !== true;
            return child.nie.title === newTitle && child.uri !== self.uri && child.ddr.deleted !== true;
        });

        if (
            !isNull(childrenWithTheSameName) && Array.isArray(childrenWithTheSameName) && childrenWithTheSameName.length > 0 ||
            !isNull(childrenWithTheSameName) && childrenWithTheSameName instanceof Object
        )
        {
            shouldRename = true;
        }

        callback(null, shouldRename);
    };

    async.waterfall([
        getParent,
        getChildrenOfParent,
        renameIfChildExistsWithSameName
    ], callback);
};

InformationElement.prototype.rename = function (newTitle, callback, customGraphUri)
{
    const self = this;
    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    const query =
        "WITH [0] \n" +
        "DELETE \n" +
        "{ \n" +
        "   [1] nie:title ?title \n" +
        "} \n" +
        "WHERE \n" +
        "{ \n" +
        "   [1] nie:title ?title \n" +
        "} \n" +
        "INSERT \n" +
        "{ \n" +
        "   [1] nie:title [2] \n" +
        "} \n";

    db.connection.executeViaJDBC(query,
        [
            {
                type: Elements.types.resourceNoEscape,
                value: graphUri
            },
            {
                type: Elements.types.resource,
                value: self.uri
            },
            {
                type: Elements.ontologies.nie.title.type,
                value: newTitle
            }
        ],
        function (err, result)
        {
            if (isNull(err))
            {
                self.nie.title = newTitle;
                self.refreshHumanReadableUri(function (err, result)
                {
                    if (isNull(err))
                    {
                        Cache.getByGraphUri(db.graphUri).delete(self.uri, function (err, result)
                        {
                            if (isNull(err))
                            {
                                self.reindex(function (err, result)
                                {
                                    if (isNull(err))
                                    {
                                        return callback(err, self);
                                    }

                                    const msg = "Error reindexing file " + self.uri + " : " + JSON.stringify(err, null, 4) + "\n" + JSON.stringify(result, null, 4);
                                    Logger.log("error", msg);
                                    return callback(1, msg);
                                });
                            }
                            else
                            {
                                const msg = "Error invalidating cache for information element : " + self.uri + JSON.stringify(result);
                                Logger.log("error", msg);
                                Logger.log("error", JSON.stringify(err));
                                Logger.log("error", JSON.stringify(result));
                                return callback(1, msg);
                            }
                        });
                    }
                    else
                    {
                        const msg = "Error refreshing human readable uri of file: " + self.uri + JSON.stringify(result);
                        Logger.log("error", msg);
                        Logger.log("error", JSON.stringify(err));
                        Logger.log("error", JSON.stringify(result));
                        return callback(1, msg);
                    }
                });
            }
            else
            {
                Logger.log("error", "Error occurred renaming file or folder " + self.uri);
                Logger.log("error", JSON.stringify(err));
                Logger.log("error", JSON.stringify(result));
                return callback(err, result);
            }
        }, null, null, null, true
    );
};

InformationElement.prototype.moveToFolder = function (newParentFolder, callback)
{
    const Folder = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/folder.js")).Folder;
    const File = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/file.js")).File;
    const self = this;

    const oldParentUri = self.nie.isLogicalPartOf;
    const newParentUri = newParentFolder.uri;

    const autoRenameIfNeeded = function (callback)
    {
        self.needsRenaming(function (err, needsRename)
        {
            if (isNull(err))
            {
                if (needsRename === true)
                {
                    File.findByUri(self.uri, function (err, file)
                    {
                        if (isNull(err))
                        {
                            if (!isNull(file))
                            {
                                file.autorename();
                                file.save(function (err, result)
                                {
                                    callback(err, result);
                                });
                            }
                            else
                            {
                                Folder.findByUri(self.uri, function (err, folder)
                                {
                                    if (isNull(err))
                                    {
                                        if (!isNull(folder))
                                        {
                                            folder.autorename();
                                            folder.save(function (err, result)
                                            {
                                                callback(err, result);
                                            });
                                        }
                                        else
                                        {
                                            let errorMessage = "Error: The InformationElement: " + self.uri + " is neither a folder nor a file";
                                            Logger.log("error", errorMessage);
                                            return callback(true, errorMessage);
                                        }
                                    }
                                    else
                                    {
                                        return callback(err, folder);
                                    }
                                });
                            }
                        }
                        else
                        {
                            return callback(err, file);
                        }
                    });
                }
                else
                {
                    return callback(err, needsRename);
                }
            }
            else
            {
                return callback(err, needsRename);
            }
        }, null, newParentUri);
    };

    async.waterfall([
        autoRenameIfNeeded,
        function (neededRenaming, callback)
        {
            const query =
                "WITH GRAPH [0] \n" +
                "DELETE \n" +
                "{ \n" +
                "   [1] nie:hasLogicalPart [2]. \n" +
                "   [2] nie:isLogicalPartOf [1] \n" +
                "} \n" +
                "INSERT \n" +
                "{ \n" +
                "   [3] nie:hasLogicalPart [2]. \n" +
                "   [2] nie:isLogicalPartOf [3] \n" +
                "} \n";

            db.connection.executeViaJDBC(query,
                [
                    {
                        type: Elements.types.resourceNoEscape,
                        value: db.graphUri
                    },
                    {
                        type: Elements.ontologies.nie.hasLogicalPart.type,
                        value: oldParentUri
                    },
                    {
                        type: Elements.ontologies.nie.hasLogicalPart.type,
                        value: self.uri
                    },
                    {
                        type: Elements.ontologies.nie.hasLogicalPart.type,
                        value: newParentUri
                    }
                ],
                function (err, result)
                {
                    if (isNull(err))
                    {
                        // invalidate caches on parent, old parent and child...
                        async.series([
                            function (callback)
                            {
                                Cache.getByGraphUri(db.graphUri).delete(self.uri, callback);
                            },
                            function (callback)
                            {
                                Cache.getByGraphUri(db.graphUri).delete(newParentUri, callback);
                            },
                            function (callback)
                            {
                                Cache.getByGraphUri(db.graphUri).delete(oldParentUri, callback);
                            },

                            // refresh all human readable URIs on parent, old parent and child...
                            function (callback)
                            {
                                self.refreshChildrenHumanReadableUris(callback);
                            },
                            function (callback)
                            {
                                newParentFolder.refreshChildrenHumanReadableUris(callback);
                            },
                            function (callback)
                            {
                                Folder.findByUri(oldParentUri, function (err, oldParent)
                                {
                                    if (isNull(err))
                                    {
                                        if (oldParent instanceof Folder)
                                        {
                                            oldParent.refreshChildrenHumanReadableUris(callback);
                                        }
                                        else
                                        {
                                            callback(1, "Old parent folder of information element: " + self.uri + " was not found!");
                                        }
                                    }
                                    else
                                    {
                                        const msg = "Error occurred while retrieving old parent folder of information element: " + self.uri;
                                        Logger.log("error", msg);
                                        Logger.log("error", err);
                                        Logger.log("error", oldParent);
                                        callback(1, msg);
                                    }
                                });
                            }
                        ], function (err)
                        {
                            return callback(err, result);
                        });
                    }
                    else
                    {
                        return callback(err, result);
                    }
                }, null, null, null, true);
        }
    ], function (err, results)
    {
        callback(err, results);
    });
};

InformationElement.prototype.unlinkFromParent = function (callback)
{
    const self = this;
    self.getParent(function (err, parent)
    {
        if (isNull(err))
        {
            if (parent instanceof Object && !isNull(parent.nie))
            {
                let parentParts = parent.nie.hasLogicalPart;

                // remove myself from parent.
                if (parentParts instanceof Array)
                {
                    parentParts = _.without(parentParts, [self.uri]);
                }
                else
                {
                    if (parentParts === self.uri)
                    {
                        parentParts = null;
                    }
                }

                parent.nie.hasLogicalPart = parentParts;

                // Save modified parts, now with myself removed from them.
                parent.save(function (err, result)
                {
                    return callback(err, result);
                });
            }
            else
            {
                return callback(null, self.uri + " already has no parent.");
            }
        }
        else
        {
            return callback(1, "Unable to retrieve the parent of " + self.uri + " for unlinking it. Error reported by database : " + parent);
        }
    });
};

InformationElement.prototype.reindex = function (callback, customGraphUri)
{
    const self = this;

    self.canBeIndexed(function (err, canBeIndexed)
    {
        if (isNull(err))
        {
            if (canBeIndexed)
            {
                InformationElement.baseConstructor.prototype.reindex.call(self, callback, customGraphUri);
            }
            else
            {
                InformationElement.baseConstructor.prototype.unindex.call(self, callback, customGraphUri);
            }
        }
        else
        {
            callback(err, canBeIndexed);
        }
    });
};

InformationElement.prototype.canBeIndexed = function (callback)
{
    const self = this;

    self.getOwnerProject(function (err, project)
    {
        if (isNull(err))
        {
            switch (project.ddr.privacyStatus)
            {
            case "public":
                callback(null, true);
                break;
            case "private":
                callback(null, false);
                break;
            case "metadata_only":
                callback(null, true);
                break;
            default:
                callback(null, false);
                break;
            }
        }
        else
        {
            const msg = "Error while checking privacy of project that owns resource " + self.uri;
            Logger.log("error", msg);
            callback(1, msg);
        }
    });
};

InformationElement.prototype.isHiddenOrSystem = function ()
{
    const self = this;

    if (isNull(self.nie) || isNull(self.nie.title))
    {
        return false;
    }

    for (let i = 0; i < Config.systemOrHiddenFilesRegexes.length; i++)
    {
        const regex = new RegExp(Config.systemOrHiddenFilesRegexes[i]);

        if (self.nie.title.match(regex))
        {
            return true;
        }
    }

    return false;
};

InformationElement.removeInvalidFileNames = function (fileNamesArray)
{
    const _ = require("underscore");

    const validFiles = [];

    _.each(fileNamesArray, function (fileName)
    {
        const ie = new InformationElement({
            nie: {
                title: fileName
            }
        });

        if (!ie.isHiddenOrSystem())
        {
            validFiles.push(fileName);
        }
    });

    return validFiles;
};

InformationElement.isSafePath = function (absPath, callback)
{
    let fs = require("fs");
    if (isNull(absPath))
    {
        Logger.log("error", "Path " + absPath + " is not within safe paths!! Some operation is trying to modify files outside of Dendro's installation directory!");
        return callback(null, false);
    }

    fs.realpath(absPath, function (err, realPath)
    {
        function b_in_a (b, a)
        {
            return (b.indexOf(a) === 0);
        }

        const validDirs = [Config.tempFilesDir, Config.tempUploadsDir];

        for (let i = 0; i < validDirs.length; i++)
        {
            if (b_in_a(realPath, validDirs[i]))
            {
                return callback(null, true);
            }
        }

        Logger.log("error", "Path " + absPath + " is not within safe paths!! Some operation is trying to modify files outside of Dendro's installation directory!");
        return callback(null, false);
    });
};

InformationElement.prototype.findMetadata = function (callback, typeConfigsToRetain, recursive)
{
    const async = require("async");

    const self = this;
    InformationElement.findByUri(self.uri, function (err, resource)
    {
        if (isNull(err))
        {
            if (!isNull(resource))
            {
                const metadataResult = {
                    title: resource.nie.title,
                    descriptors: resource.getDescriptors([Elements.access_types.private], [Elements.access_types.api_readable], typeConfigsToRetain),
                    file_extension: resource.ddr.fileExtension,
                    hasLogicalParts: []
                };

                if (!isNull(resource.ddr) && !isNull(resource.ddr.metadataQuality))
                {
                    metadataResult.metadata_quality = resource.ddr.metadataQuality;
                }
                else
                {
                    metadataResult.metadata_quality = 0;
                }

                if (isNull(err))
                {
                    resource.getLogicalParts(function (err, children)
                    {
                        if (isNull(err))
                        {
                            const _ = require("underscore");
                            children = _.reject(children, function (child)
                            {
                                return child.ddr.deleted;
                            });

                            if (children.length > 0)
                            {
                                if (recursive)
                                {
                                    // 1st parameter in async.each() is the array of items
                                    async.each(children,
                                        // 2nd parameter is the function that each item is passed into
                                        function (child, callback)
                                        {
                                            // Call an asynchronous function
                                            child.findMetadataRecursive(function (err, result2)
                                            {
                                                if (isNull(err))
                                                {
                                                    metadataResult.hasLogicalParts.push(result2);
                                                    return callback(null);
                                                }
                                                Logger.log("info", "[findMetadata] error accessing metadata of resource " + self.nie.title);
                                                return callback(err);
                                            }, typeConfigsToRetain);
                                        },
                                        // 3rd parameter is the function call when everything is done
                                        function (err)
                                        {
                                            if (isNull(err))
                                            {
                                                // All tasks are done now
                                                return callback(null, metadataResult);
                                            }
                                            return callback(true, null);
                                        }
                                    );
                                }
                                else
                                {
                                    // 1st parameter in async.each() is the array of items
                                    async.each(children,
                                        // 2nd parameter is the function that each item is passed into
                                        function (child, callback)
                                        {
                                            // Call an asynchronous function
                                            metadataResult.hasLogicalParts.push({
                                                title: child.nie.title
                                            });
                                            return callback(null);
                                        },
                                        // 3rd parameter is the function call when everything is done
                                        function (err)
                                        {
                                            if (isNull(err))
                                            {
                                                // All tasks are done now
                                                return callback(null, metadataResult);
                                            }

                                            return callback(true, null);
                                        }
                                    );
                                }
                            }
                            else
                            {
                                return callback(null, metadataResult);
                            }
                        }
                        else
                        {
                            Logger.log("info", "[Information Element find metadata] error accessing logical parts of folder " + resource.nie.title);
                            return callback(true, null);
                        }
                    });
                }
                else
                {
                    Logger.log("info", "[Information Element find metadata] " + resource.nie.title + " is not a folder.");
                    return callback(null, metadataResult);
                }
            }
            else
            {
                const msg = self.uri + " does not exist in Dendro.";
                Logger.log("error", msg);

                return callback(true, msg);
            }
        }
        else
        {
            const msg = "Error fetching " + self.uri + " from the Dendro platform.";
            Logger.log("error", msg);

            return callback(true, msg);
        }
    }, null, null, null, [Elements.access_types.private], [Elements.access_types.api_readable]);
};

InformationElement.prototype.containedIn = function (parentResource, callback, customGraphUri)
{
    const self = this;

    if (parentResource.uri === self.uri)
    {
        callback(null, true);
    }
    else
    {
        const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

        db.connection.executeViaJDBC(
            "WITH [0]\n" +
            "ASK \n" +
            "WHERE \n" +
            "{ \n" +
            "   {\n" +
            "       [2] nie:isLogicalPartOf+ [1]. \n" +
            "       [1] nie:hasLogicalPart+ [2]. \n" +
            "   }\n" +
            "} \n",

            [
                {
                    type: Elements.types.resourceNoEscape,
                    value: graphUri
                },
                {
                    type: Elements.ontologies.nie.isLogicalPartOf.type,
                    value: parentResource.uri
                },
                {
                    type: Elements.ontologies.nie.hasLogicalPart.type,
                    value: self.uri
                }
            ],
            function (err, result)
            {
                if (isNull(err))
                {
                    if (result instanceof Array)
                    {
                        if (result.length === 0)
                        {
                            return callback(null, false);
                        }

                        return callback(null, true);
                    }

                    return callback(null, result);
                }

                const msg = "Error checking if resource " + self.uri + " is contained in " + parentResource.uri;
                Logger.log("error", msg);
                return callback(err, msg);
            });
    }
};

InformationElement.prototype.getHumanReadableUri = function (callback)
{
    const self = this;

    if (!isNull(self.nie))
    {
        if (isNull(self.nie.isLogicalPartOf))
        {
            callback(1, "Unable to get human readable URI for the resource " + self.uri + ": There is no nie.isLogicalPartOf in the object!");
        }
        else if (isNull(self.nie.title))
        {
            callback(1, "Unable to get human readable URI for the resource " + self.uri + ": There is no nie.title in the object!");
        }
        else
        {
            Resource.getHumanReadableUriFromUri(self.nie.isLogicalPartOf, function (err, parentHumanReadableUri)
            {
                if (isNull(err))
                {
                    if (!isNull(parentHumanReadableUri))
                    {
                        callback(null, parentHumanReadableUri + "/" + self.nie.title);
                    }
                    else
                    {
                        callback(1, "Unable to get parent human readable URI for information element " + self.uri);
                    }
                }
                else
                {
                    callback(1, "Error getting parent human readable URI for information element " + self.uri);
                }
            });
        }
    }
    else
    {
        callback(1, "Unable to get human readable URI for the resource " + self.uri + ": There is no nie namespace in the object!");
    }
};

InformationElement.prototype.refreshChildrenHumanReadableUris = function (callback, customGraphUri)
{
    const self = this;
    const Folder = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/folder.js")).Folder;
    if (self.isA(Folder))
    {
        Folder.findByUri(self.uri, function (err, folder)
        {
            if (isNull(err))
            {
                if (!isNull(folder))
                {
                    folder.refreshChildrenHumanReadableUris(callback, customGraphUri);
                }
                else
                {
                    callback(true, "There is no folder with uri: " + self.uri);
                }
            }
            else
            {
                callback(err, folder);
            }
        });
    }
    else
    {
        callback(null, self);
    }
};

InformationElement = Class.extend(InformationElement, Resource, "nie:InformationElement");

module.exports.InformationElement = InformationElement;
