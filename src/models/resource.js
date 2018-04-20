const path = require("path");
const validator = require("validator");
const Pathfinder = global.Pathfinder;
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;

const isNull = require(Pathfinder.absPathInSrcFolder("/utils/null.js")).isNull;
const Utils = require(Pathfinder.absPathInPublicFolder("/js/utils.js")).Utils;
const Class = require(Pathfinder.absPathInSrcFolder("/models/meta/class.js")).Class;
const Elements = require(Pathfinder.absPathInSrcFolder("/models/meta/elements.js")).Elements;
const Logger = require(Pathfinder.absPathInSrcFolder("utils/logger.js")).Logger;
const DbConnection = require(Pathfinder.absPathInSrcFolder("/kb/db.js")).DbConnection;
const IndexConnection = require(Pathfinder.absPathInSrcFolder("/kb/index.js")).IndexConnection;
const Cache = require(Pathfinder.absPathInSrcFolder("/kb/cache/cache.js")).Cache;

const async = require("async");
const _ = require("underscore");

const db = Config.getDBByID();

function Resource (object)
{
    let self = this;
    self.addURIAndRDFType(object, "resource", Resource);
    Resource.baseConstructor.call(this, object);

    self.copyOrInitDescriptors(object);

    if (!isNull(object.rdf) && !isNull(object.rdf.prefixedRDFType))
    {
        self.rdf.type = object.rdf.type;
    }

    return self;
}

Resource.prototype.copyOrInitDescriptors = function (object, deleteIfNotInArgumentObject)
{
    const self = this;

    if (deleteIfNotInArgumentObject)
    {
        for (let key in self)
        {
            if (key !== "uri")
            {
                delete self[key];
            }
        }
    }

    for (let prefix in Elements.ontologies)
    {
        if (Elements.ontologies.hasOwnProperty(prefix))
        {
            if (isNull(self[prefix]))
            {
                self[prefix] = {};
            }

            if (object.hasOwnProperty(prefix))
            {
                for (let shortName in object[prefix])
                {
                    if (object[prefix].hasOwnProperty(shortName))
                    {
                        if (isNull(self[prefix][shortName]) && !isNull(object[prefix][shortName]))
                        {
                            self[prefix][shortName] = object[prefix][shortName];
                        }
                    }
                }
            }
        }
    }

    if ((!isNull(object.ddr) && !isNull(object.ddr.created)))
    {
        self.ddr.created = object.ddr.created;
    }
    else
    {
        const now = new Date();
        self.ddr.created = now.toISOString();
    }
};

Resource.prototype.loadObjectWithQueryResults = function (queryResults, ontologyURIsArray)
{
    const self = this;
    const Descriptor = require(Pathfinder.absPathInSrcFolder("/models/meta/descriptor.js")).Descriptor;

    self.clearDescriptors();

    if (!isNull(queryResults) && queryResults instanceof Array && queryResults.length > 0)
    {
        for (let i = 0; i < queryResults.length; i++)
        {
            const descriptor = new Descriptor(queryResults[i]);
            const prefix = descriptor.prefix;
            const shortName = descriptor.shortName;

            if (!isNull(prefix) && !isNull(shortName) && _.contains(ontologyURIsArray, descriptor.ontology))
            {
                if (isNull(self[prefix]))
                {
                    self[prefix] = {};
                }

                if (!isNull(self[prefix][shortName]))
                {
                    // if there is already a value for this object, put it in an array
                    if (!(self[prefix][shortName] instanceof Array))
                    {
                        self[prefix][shortName] = [self[prefix][shortName]];
                    }

                    self[prefix][shortName].push(descriptor.value);
                }
                else
                {
                    self[prefix][shortName] = descriptor.value;
                }
            }
        }
    }

    return self;
};

Resource.exists = function (uri, callback, customGraphUri)
{
    const self = this;
    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    let typesRestrictions = "";
    let types;

    if (self.prefixedRDFType instanceof Array)
    {
        types = self.prefixedRDFType;
    }
    else
    {
        types = [self.prefixedRDFType];
    }

    for (let i = 0; i < types.length; i++)
    {
        typesRestrictions = typesRestrictions + "[1] rdf:type " + types[i];

        if (i < types.length - 1)
        {
            typesRestrictions = typesRestrictions + ".\n";
        }
    }

    db.connection.executeViaJDBC(
        "WITH [0]\n" +
        "ASK \n" +
        "WHERE \n" +
        "{ \n" +
        "   {\n" +
        "       [1] ?p ?o. \n" +
        typesRestrictions +
        "   }\n" +
        "} \n",

        [
            {
                type: Elements.types.resourceNoEscape,
                value: graphUri
            },
            {
                type: Elements.types.resource,
                value: uri
            }
        ],
        function (err, result)
        {
            if (isNull(err))
            {
                if (result instanceof Array)
                {
                    return callback(null, result.length > 0);
                }
                return callback(null, result);
            }
            const msg = "Error checking for the existence of resource with uri : " + uri;
            Logger.log("error", msg);
            Logger.log("error", JSON.stringify(err));
            Logger.log("error", JSON.stringify(result));
            return callback(err, msg);
        });
};

Resource.forAll = function (
    resourcePageCallback,
    checkFunction,
    finalCallback,
    customGraphUri,
    descriptorTypesToRemove,
    descriptorTypesToExemptFromRemoval,
    includeArchivedResources
)
{
    const self = this;
    const type = self.prefixedRDFType;

    const dummyReq = {
        query: {
            currentPage: 0,
            pageSize: 10000
        }
    };

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    const queryArguments = [
        {
            type: Elements.types.resourceNoEscape,
            value: graphUri
        }
    ];

    let query =
        "SELECT DISTINCT ?uri \n" +
        "FROM [0]\n" +
        "WHERE \n" +
        "{ \n";

    if (!isNull(type))
    {
        let rdfTypes;

        if (!(self.prefixedRDFType instanceof Array))
        {
            rdfTypes = [self.prefixedRDFType];
        }
        else
        {
            rdfTypes = self.prefixedRDFType;
        }

        let argumentCount = 1;
        let typeRestrictions = "";
        for (let i = 0; i < rdfTypes.length; i++)
        {
            typeRestrictions = typeRestrictions + " ?uri rdf:type [" + argumentCount + "]";
            argumentCount++;

            queryArguments.push({
                type: Elements.types.prefixedResource,
                value: rdfTypes[i]
            });

            if (i < rdfTypes.length - 1)
            {
                typeRestrictions += ".\n";
            }
            else
            {
                typeRestrictions += "\n";
            }
        }

        query = query + typeRestrictions;
    }
    else
    {
        query = query + " ?uri ?p ?o\n";
    }

    if (isNull(includeArchivedResources) || !includeArchivedResources)
    {
        query = query + "\nFILTER NOT EXISTS { ?uri rdf:type ddr:ArchivedResource }";
    }

    query = query + "} \n";

    query = DbConnection.paginateQuery(
        dummyReq,
        query
    );

    let resultsSize;
    async.until(
        function ()
        {
            if (!isNull(checkFunction))
            {
                if (!checkFunction())
                {
                    return false;
                }
                // check function failed, stop querying!
                finalCallback(1, "Validation condition not met when fetching resources with pagination. Aborting paginated querying...");
                return true;
            }

            if (!isNull(resultsSize))
            {
                if (resultsSize > 0)
                {
                    return false;
                }

                return true;
            }

            return true;
        },
        function (callback)
        {
            db.connection.executeViaJDBC(
                query,
                queryArguments,
                function (err, results)
                {
                    if (isNull(err))
                    {
                        dummyReq.query.currentPage++;
                        async.mapSeries(results,
                            function (result, cb)
                            {
                                const aResource = new self.prototype.constructor(result);
                                self.findByUri(aResource.uri, function (err, completeResource)
                                {
                                    if (!isNull(descriptorTypesToRemove) && descriptorTypesToRemove instanceof Array)
                                    {
                                        completeResource.clearDescriptors(descriptorTypesToExemptFromRemoval, descriptorTypesToRemove);
                                    }

                                    cb(err, completeResource);
                                });
                            },
                            function (err, results)
                            {
                                resultsSize = results.length;
                                return resourcePageCallback(err, results);
                            });
                    }
                    else
                    {
                        return callback(1, "Unable to fetch all resources from the graph, on page " + dummyReq.query.currentPage);
                    }
                }
            );
        },
        function (err, results)
        {
            finalCallback(err, "All resources of type " + self.leafClass + " retrieved via pagination query.");
        }
    );
};

Resource.all = function (callback, req, customGraphUri, descriptorTypesToRemove, descriptorTypesToExemptFromRemoval)
{
    const self = this;
    const type = self.prefixedRDFType;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    const queryArguments = [
        {
            type: Elements.types.resourceNoEscape,
            value: graphUri
        }
    ];

    let query =
        "SELECT ?uri \n" +
        "FROM [0]\n" +
        "WHERE \n" +
        "{ \n";

    if (!isNull(type))
    {
        let rdfTypes;

        if (!(self.prefixedRDFType instanceof Array))
        {
            rdfTypes = [self.prefixedRDFType];
        }
        else
        {
            rdfTypes = self.prefixedRDFType;
        }

        let argumentCount = 1;
        let typeRestrictions = "";
        for (let i = 0; i < rdfTypes.length; i++)
        {
            typeRestrictions = typeRestrictions + " ?uri rdf:type [" + argumentCount + "]";
            argumentCount++;

            queryArguments.push({
                type: Elements.types.prefixedResource,
                value: rdfTypes[i]
            });

            if (i < rdfTypes.length - 1)
            {
                typeRestrictions += ".\n";
            }
            else
            {
                typeRestrictions += "\n";
            }
        }

        query = query + typeRestrictions;
    }
    else
    {
        query = query + " ?uri ?p ?o";
    }

    query = query + "} \n";

    if (!isNull(req))
    {
        const viewVars = {
            title: "All vertexes in the knowledge base"
        };

        req.viewVars = DbConnection.paginate(req,
            viewVars
        );

        query = DbConnection.paginateQuery(
            req,
            query
        );
    }

    db.connection.executeViaJDBC(
        query,
        queryArguments,
        function (err, results)
        {
            if (isNull(err))
            {
                async.mapSeries(results,
                    function (result, cb)
                    {
                        const aResource = new self.prototype.constructor(result);
                        self.findByUri(aResource.uri, function (err, completeResource)
                        {
                            if (!isNull(descriptorTypesToRemove) && descriptorTypesToRemove instanceof Array)
                            {
                                completeResource.clearDescriptors(descriptorTypesToExemptFromRemoval, descriptorTypesToRemove);
                            }

                            cb(err, completeResource);
                        });
                    },
                    function (err, results)
                    {
                        return callback(err, results);
                    });
            }
            else
            {
                return callback(1, "Unable to fetch all resources from the graph");
            }
        });
};

/**
 * Removes all the triples with this resource as their subject
 * @type {updateDescriptors}
 */
Resource.prototype.deleteAllMyTriples = function (callback, customGraphUri)
{
    const self = this;

    let graphUri;
    if (isNull(customGraphUri))
    {
        graphUri = Config.db.default.graphUri;
    }
    else
    {
        graphUri = customGraphUri;
    }

    // Invalidate cache record for the updated resources
    Cache.getByGraphUri(graphUri).delete(self.uri, function (err, result)
    {
        self.unindex(function (err, result)
        {
            if (isNull(err))
            {
                Config.getDBByGraphUri(graphUri).connection.executeViaJDBC(
                    "WITH [0] \n" +
                    "DELETE \n" +
                    "WHERE " +
                    "{ \n" +
                    "   [1] ?p ?o \n" +
                    "} \n",
                    [
                        {
                            type: Elements.types.resourceNoEscape,
                            value: graphUri
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
                            return callback(err, results);
                        }
                        return callback(1, results);
                    });
            }
            else
            {
                callback(2, err);
            }
        }, customGraphUri);
    });
};

/**
 * Removes all the triples with this resource as their subject, predicateInPrefixedForm
 * as the predicate and value as the object
 * @param predicateInPrefixedForm
 * @param value
 * @param callback
 */
Resource.prototype.deleteDescriptorTriples = function (descriptorInPrefixedForm, callback, valueInPrefixedForm, customGraphUri)
{
    const self = this;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    if (!isNull(descriptorInPrefixedForm))
    {
        if (!isNull(valueInPrefixedForm))
        {
            db.connection.executeViaJDBC(
                "WITH [0] \n" +
                    "DELETE \n" +
                    "WHERE " +
                    "{ " +
                    "   [1] [2] [3] " +
                    "} \n",
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
                        type: Elements.types.prefixedResource,
                        value: descriptorInPrefixedForm
                    },
                    {
                        type: Elements.types.prefixedResource,
                        value: valueInPrefixedForm
                    }
                ],
                function (err, results)
                {
                    if (isNull(err))
                    {
                        // Invalidate cache record for the updated resources
                        Cache.getByGraphUri(db).delete([self.uri, valueInPrefixedForm], function (err, result)
                        {
                            return callback(err, result);
                        });
                    }
                    else
                    {
                        return callback(1, results);
                    }
                });
        }
        else
        {
            db.connection.executeViaJDBC(
                "WITH [0] \n" +
                    "DELETE \n" +
                    "WHERE " +
                    "{ " +
                    "   [1] [2] ?o " +
                    "} \n",
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
                        type: Elements.types.prefixedResource,
                        value: descriptorInPrefixedForm
                    }
                ],
                function (err, results)
                {
                    if (isNull(err))
                    {
                        // Invalidate cache record for the updated resources
                        Cache.getByGraphUri(graphUri).delete([self.uri, valueInPrefixedForm], function (err, result)
                        {
                            return callback(err, result);
                        });
                    }
                    else
                    {
                        return callback(1, results);
                    }
                });
        }
    }
    else
    {
        const msg = "No descriptor specified --> Descriptor " + descriptorInPrefixedForm;
        Logger.log("error", msg);
        return callback(1, msg);
    }
};

Resource.prototype.descriptorValue = function (descriptorWithNamespaceSeparatedByColon, callback, customGraphUri)
{
    const self = this;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    db.connection.executeViaJDBC(
        "WITH [0] \n" +
            "SELECT ?p ?o \n" +
            "WHERE " +
            "{" +
                " [1] [2] ?o " +
            "} \n",
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
                type: Elements.types.prefixedResource,
                value: descriptorWithNamespaceSeparatedByColon
            }
        ],
        function (err, results)
        {
            if (isNull(err))
            {
                const extractedResults = [];
                for (let i = 0; i < results.length; i++)
                {
                    extractedResults.push(results[i].o);
                }

                return callback(err, extractedResults);
            }
            return callback(1, results);
        });
};

Resource.prototype.clearOutgoingPropertiesFromOntologies = function (ontologyURIsArray, callback, customGraphUri)
{
    const self = this;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;
    const descriptors = self.getPropertiesFromOntologies(ontologyURIsArray, graphUri);

    const triplesToDelete = [];
    for (let i = 0; i < descriptors.length; i++)
    {
        const descriptor = descriptors[i];
        triplesToDelete.push({
            subject: self.uri,
            predicate: descriptor.uri,
            object: null
        });
    }

    db.deleteTriples(triplesToDelete, db.graphUri, callback);
};

/**
 * Loads properties into this resource object
 * @param ontologyURIsArray
 * @param callback
 * @param customGraphUri
 */

Resource.prototype.loadPropertiesFromOntologies = function (ontologyURIsArray, callback, customGraphUri)
{
    const self = this;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    // build arguments string from the requested ontologies,
    // as well as the FROM string with the parameter placeholders
    let argumentsArray = [
        {
            type: Elements.types.resourceNoEscape,
            value: graphUri
        },
        {
            type: Elements.types.resource,
            value: self.uri
        }
    ];

    const query =
        " SELECT DISTINCT ?uri ?value \n" +
        " FROM [0] \n" +
        " WHERE \n" +
        " { \n" +
        "   [1] ?uri ?value .\n" +
        " } \n";

    db.connection.executeViaJDBC(query,
        argumentsArray,
        function (err, descriptors)
        {
            if (isNull(err))
            {
                self.loadObjectWithQueryResults(descriptors, ontologyURIsArray);
                callback(null, self);
            }
            else
            {
                Logger.log("error", "Error fetching descriptors from ontologies : " + JSON.stringify(ontologyURIsArray) + ". Error returned : " + descriptors);
                return callback(1, descriptors);
            }
        });
};

/**
 * Retrieves properties of this resource object as array of descriptors
 * @param ontologyURIsArray
 * @param callback
 * @param customGraphUri
 */

Resource.prototype.getPropertiesFromOntologies = function (ontologyURIsArray, customGraphUri, typeConfigsToRetain)
{
    const self = this;
    const Descriptor = require(Pathfinder.absPathInSrcFolder("/models/meta/descriptor.js")).Descriptor;
    const Ontology = require(Pathfinder.absPathInSrcFolder("/models/meta/ontology.js")).Ontology;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    const transformUrisToPrefixes = function (urisArray)
    {
        let prefixes = [];
        for (let i = 0; i < urisArray.length; i++)
        {
            prefixes.push(Ontology.getOntologyPrefix(urisArray[i]));
        }
        return prefixes;
    };

    let prefixes;
    if (ontologyURIsArray instanceof Array)
    {
        prefixes = transformUrisToPrefixes(ontologyURIsArray);
    }
    else
    {
        prefixes = Ontology.getAllOntologyPrefixes();
    }

    const formattedResults = [];

    for (let i = 0; i < prefixes.length; i++)
    {
        let prefix = prefixes[i];
        if (!isNull(self[prefix]))
        {
            let elements = Object.keys(self[prefix]);
            for (let j = 0; j < elements.length; j++)
            {
                let element = elements[j];
                let formattedDescriptor;
                if (!isNull(Elements.ontologies[prefix][element]) && !isNull(self[prefix][element]))
                {
                    try
                    {
                        formattedDescriptor = new Descriptor({
                            prefix: prefix,
                            shortName: element,
                            value: self[prefix][element]
                        }, typeConfigsToRetain);

                        formattedResults.push(formattedDescriptor);
                    }
                    catch (e)
                    {
                        Logger.log("error", JSON.stringify(e));
                    }
                }
            }
        }
    }

    return formattedResults;
};

Resource.prototype.validateDescriptorValues = function (callback)
{
    const self = this;
    const descriptorsArray = self.getDescriptors();

    const descriptorValueIsWithinAlternatives = function (descriptor, callback)
    {
        if (!isNull(descriptor.hasAlternative) && descriptor.hasAlternative instanceof Array)
        {
            const alternatives = descriptor.hasAlternative;

            let detectedAlternative = false;

            for (let i = 0; i < alternatives.length; i++)
            {
                if (descriptor.value === alternatives[i])
                {
                    detectedAlternative = true;
                    break;
                }
            }

            if (!detectedAlternative)
            {
                const error = "[ERROR] Value \"" + descriptor.value + "\" of descriptor " + descriptor.uri + " is invalid, because it is not one of the valid alternatives " + JSON.stringify(descriptor.hasAlternative) + ". " +
                    "This error occurred when checking the validity of the descriptors of resource " + self.uri;
                Logger.log("error", error);
                return callback(1, error);
            }
            return callback(null, null);
        }
        return callback(null, null);
    };

    const descriptorValueConformsToRegex = function (descriptor, callback)
    {
        if (!isNull(descriptor.hasRegex) && (typeof descriptor.hasRegex === "string"))
        {
            const regex = new RegExp(descriptor.hasRegex);

            if (!regex.match(descriptor.value))
            {
                const error = "[ERROR] Value \"" + descriptor.value + "\" of descriptor " + descriptor.uri + " is invalid, because it does not comply with the regular expression " + descriptor.hasRegex + ". " +
                    "This error occurred when checking the validity of the descriptors of resource " + self.uri;
                Logger.log("error", error);
                return callback(1, error);
            }
            return callback(null, null);
        }
        return callback(null, null);
    };

    async.detectSeries(descriptorsArray,
        function (descriptor, callback)
        {
            async.series(
                [
                    async.apply(descriptorValueIsWithinAlternatives, descriptor),
                    async.apply(descriptorValueConformsToRegex, descriptor)
                ],
                function (error, info)
                {
                    return callback(error, info);
                }
            );
        },
        function (err, errors)
        {
            if (err)
            {
                Logger.log("error", "Error detected while validating descriptors: " + JSON.stringify(errors));
                return callback(err, errors);
            }
            return callback(err, errors);
        }
    );
};

Resource.prototype.replaceDescriptorsInTripleStore = function (newDescriptors, db, callback)
{
    const self = this;
    const subject = self.uri;
    const graphName = db.graphUri;

    if (!isNull(newDescriptors) && newDescriptors instanceof Object)
    {
        let deleteString = "";
        let insertString = "";

        let predCount = 0;
        let argCount = 1;

        const queryArguments = [
            {
                type: Elements.types.resourceNoEscape,
                value: graphName
            }
        ];

        // build the delete string
        deleteString = deleteString + " [" + argCount++ + "]";

        queryArguments.push({
            type: Elements.types.resource,
            value: subject
        });

        deleteString = deleteString + " ?p" + predCount++;
        deleteString = deleteString + " ?o" + predCount++ + " . \n";

        for (let i = 0; i < newDescriptors.length; i++)
        {
            const newDescriptor = newDescriptors[i];

            let objects = newDescriptor.value;

            if (!isNull(objects))
            {
                // build insertion string (using object values for each of the predicates)
                if (!(objects instanceof Array))
                {
                    objects = [objects];
                }

                for (let j = 0; j < objects.length; j++)
                {
                    insertString = insertString + " [" + argCount++ + "] ";

                    queryArguments.push({
                        type: Elements.types.resource,
                        value: subject
                    });

                    insertString = insertString + " [" + argCount++ + "] ";

                    queryArguments.push({
                        type: Elements.types.resource,
                        value: newDescriptor.uri
                    });

                    insertString = insertString + " [" + argCount++ + "] ";

                    queryArguments.push({
                        type: newDescriptor.type,
                        value: objects[j]
                    });

                    insertString = insertString + ".\n";
                }
            }
        }

        const query =
            "DELETE \n" +
            "{" +
            "   GRAPH [0] \n" +
            "   {" +
            "   \n" +
                    deleteString + " \n" +
            "   } \n" +
            "} \n" +
            "WHERE \n" +
            "{ \n" +
            "   GRAPH [0] \n" +
            "   { \n" +
                    deleteString + " \n" +
            "   } \n" +
            "} \n" +
            "INSERT DATA\n" +
            "{ \n" +
            "   GRAPH [0] \n" +
            "   { \n" +
                    insertString + " \n" +
            "   } \n" +
            "} \n";

        // Invalidate cache record for the updated resources
        Cache.getByGraphUri(graphName).delete(subject, function (err, result)
        {
            db.connection.executeViaJDBC(query, queryArguments, function (err, results)
            {
                return callback(err, results);
                // Logger.log(results);
            }, null, null, null, true);
        });
    }
    else
    {
        return callback(1, "Invalid or no triples sent for insertion / update");
    }
};

/**
 * Persists the current state of the resource to the database
 * @param saveVersion save a revision of the resource
 * @param callback
 * @param entitySavingTheResource
 * @param descriptorsToExcludeFromChangesCalculation
 * @param descriptorsToExcludeFromChangeLog
 * @param descriptorsToExceptionFromChangeLog
 * @param customGraphUri if the resource is not to be saved in the main graph of the Dendro instance, speciby the uri of the other graph where to save the resource.
 */

Resource.prototype.save = function
(
    callback,
    saveVersion,
    entitySavingTheResource,
    descriptorsToExcludeFromChangesCalculation,
    descriptorsToExcludeFromChangeLog,
    descriptorsToExceptionFromChangeLog,
    customGraphUri
)
{
    const Descriptor = require(Pathfinder.absPathInSrcFolder("/models/meta/descriptor.js")).Descriptor;
    const self = this;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    const now = new Date();
    self.ddr.modified = now.toISOString();

    const validateValues = function (cb)
    {
        if (isNull(self.uri))
        {
            cb(1, "Cannot save a resource without providing an URI. Please make sure that the .uri key is not null in every object you save");
        }
        else
        {
            self.validateDescriptorValues(function (err, results)
            {
                if (err)
                {
                    Logger.log("error", "Error validating values before saving resource " + self.uri + " : " + JSON.stringify(results));
                }
                cb(err, results);
            });
        }
    };

    const getMyLastSavedVersion = function (myUri, cb)
    {
        Resource.findByUri(myUri, function (err, currentResource)
        {
            if (isNull(err))
            {
                cb(err, currentResource);
            }
            else
            {
                Logger.log("error", "Error occurred while getting last version of the resource " + myUri);
                Logger.log("error", JSON.stringify(currentResource));
                cb(err, currentResource);
            }
        }, null, customGraphUri);
    };

    const calculateChangesBetweenResources = function (currentResource, newResource, cb)
    {
        const changes = currentResource.calculateDescriptorDeltas(self, descriptorsToExcludeFromChangesCalculation);
        cb(null, currentResource, changes);
    };

    const archiveResource = function (resourceToBeArchived, entityArchivingTheResource, changes, descriptorsToExcludeFromChangeLog, descriptorsToExceptionFromChangeLog, cb)
    {
        resourceToBeArchived.makeArchivedVersion(entitySavingTheResource, function (err, archivedResource)
        {
            if (isNull(err))
            {
                const saveChange = function (change, cb)
                {
                    const changedDescriptor = new Descriptor({
                        uri: change.ddr.changedDescriptor
                    });

                    /** Force audit descriptors not to be recorded as changes;
                     * changes are visible in the system, we dont want them to
                     * appear in listings of change logs, for example. They are
                     * audit information, produced automatically, so they are
                     * changed without record**/

                    let excludeAuditDescriptorsArray;
                    if (descriptorsToExcludeFromChangeLog instanceof Array)
                    {
                        excludeAuditDescriptorsArray = descriptorsToExcludeFromChangeLog.concat([Elements.access_types.audit]);
                    }
                    else
                    {
                        excludeAuditDescriptorsArray = [Elements.access_types.audit];
                    }

                    if (changedDescriptor.isAuthorized(excludeAuditDescriptorsArray, descriptorsToExceptionFromChangeLog))
                    {
                        change.ddr.pertainsTo = archivedResource.uri;
                        change.ddr.humanReadableURI = archivedResource.uri + "/change/" + change.ddr.changeIndex;
                        change.save(function (err, result)
                        {
                            cb(err, result);
                        });
                    }
                    else
                    {
                        cb(null, null);
                    }
                };

                async.mapSeries(changes, saveChange, function (err, results)
                {
                    if (isNull(err))
                    {
                        archivedResource.save(function (err, savedArchivedResource)
                        {
                            cb(err, savedArchivedResource);
                        });
                    }
                    else
                    {
                        Logger.log("error", "Error saving changes to resource  " + archivedResource.uri + ". Error reported : " + err);
                        cb(1, results);
                    }
                });
            }
            else
            {
                Logger.log("error", "Error making archived version of resource with URI : " + self.uri + ". Error returned : " + archivedResource);
                cb(1, archivedResource);
            }
        });
    };

    const updateHumanReadableURI = function (newResource, cb)
    {
        self.getHumanReadableUri(
            function (err, newHumanReadableUri)
            {
                if (isNull(err))
                {
                    self.ddr.humanReadableURI = newHumanReadableUri;
                    cb(null, self);
                }
                else
                {
                    const msg = "Unable to determine new human readable uri for resource " + self.uri;
                    Logger.log("error", err);
                    Logger.log("error", newHumanReadableUri);
                    cb(1, msg);
                }
            }
        );
    };

    const updateResource = function (currentResource, newResource, cb)
    {
        const newDescriptors = newResource.getDescriptors();

        self.replaceDescriptorsInTripleStore(
            newDescriptors,
            db,
            function (err, result)
            {
                cb(err, result);
            }
        );
    };

    const createNewResource = function (resource, cb)
    {
        const allDescriptors = resource.getDescriptors();

        db.connection.insertDescriptorsForSubject(
            resource.uri,
            allDescriptors,
            graphUri,
            function (err, result)
            {
                if (isNull(err))
                {
                    cb(null, self);
                }
                else
                {
                    cb(err, result);
                }
            }
        );
    };

    async.waterfall([
        function (cb)
        {
            validateValues(function (err, results)
            {
                if (isNull(err))
                {
                    cb(err);
                }
                else
                {
                    cb(err, results);
                }
            });
        },
        function (cb)
        {
            getMyLastSavedVersion(self.uri, cb);
        },
        function (currentResource, cb)
        {
            if (isNull(currentResource))
            {
                updateHumanReadableURI(currentResource, function (err)
                {
                    if (isNull(err))
                    {
                        createNewResource(self, function (err, result)
                        {
                            // there was no existing resource with same URI, create a new one and exit immediately
                            return callback(err, result);
                        });
                    }
                    else
                    {
                        return callback(err, "Unable to calculate Human Readable URI when saving new resource " + self.uri);
                    }
                });
            }
            else if (saveVersion)
            {
                calculateChangesBetweenResources(currentResource, self, function (err, currentResource, changes)
                {
                    cb(err, currentResource, changes);
                });
            }
            else
            {
                cb(null, currentResource, null);
            }
        },
        function (currentResource, changes, cb)
        {
            if (saveVersion)
            {
                if (!isNull(changes) && changes instanceof Array && changes.length > 0)
                {
                    archiveResource(
                        currentResource,
                        entitySavingTheResource,
                        changes,
                        descriptorsToExcludeFromChangeLog,
                        descriptorsToExceptionFromChangeLog,
                        function (err, archivedResource)
                        {
                            cb(err, currentResource, archivedResource);
                        });
                }
                else
                {
                    // Nothing to be done, zero changes detected
                    return callback(null, self);
                }
            }
            else
            {
                cb(null, currentResource, null);
            }
        },
        function (currentResource, archivedResource, cb)
        {
            updateHumanReadableURI(currentResource, function (err, currentResourceWithNewHumanReadableUri)
            {
                cb(err, currentResourceWithNewHumanReadableUri, archivedResource);
            });
        },
        function (currentResource, archivedResource, cb)
        {
            if (saveVersion)
            {
                if (!isNull(currentResource) && !isNull(archivedResource))
                {
                    updateResource(currentResource, self, cb);
                }
                else
                {
                    cb(1, "Unable to archive resource or to get current one.");
                }
            }
            else
            {
                updateResource(currentResource, self, cb);
            }
        }
    ],
    function (err, result)
    {
        if (isNull(err))
        {
            return callback(err, self);
        }
        return callback(err, result);
    });
};

/**
 * Update descriptors with the ones sent as argument, leaving existing descriptors untouched
 * MERGE DESCRIPTORS BEFORE CALLING (for cases when descriptor values are arrays)
 * @param descriptors
 * @param callback
 */

Resource.prototype.updateDescriptors = function (descriptors, cannotChangeTheseDescriptorTypes, unlessTheyAreOfTheseTypes)
{
    const self = this;

    // set only the descriptors sent as argument
    for (let i = 0; i < descriptors.length; i++)
    {
        const descriptor = descriptors[i];
        if (!isNull(descriptor.prefix) && !isNull(descriptor.shortName))
        {
            if (descriptor.isAuthorized(cannotChangeTheseDescriptorTypes, unlessTheyAreOfTheseTypes))
            {
                if (descriptor.value === null)
                {
                    delete self[descriptor.prefix][descriptor.shortName];
                }
                else
                {
                    self[descriptor.prefix][descriptor.shortName] = descriptor.value;
                }
            }
        }
        else
        {
            const util = require("util");
            const error = "Descriptor " + util.inspect(descriptor) + " does not have a prefix and a short name.";
            Logger.log("error", error);
        }
    }

    return self;
};

/**
 * Used for deleting a resource.
 * Resources pointing to this resource will not be deleted.
 *
 * Only triples with this resource as their subject will be deleted.
 */
Resource.prototype.clearDescriptors = function (descriptorTypesToClear, exceptionedDescriptorTypes)
{
    const self = this;

    const allDescriptors = self.getDescriptors();
    const filteredDescriptors = self.getDescriptors(descriptorTypesToClear, exceptionedDescriptorTypes);

    for (let i = 0; i < allDescriptors.length; i++)
    {
        let descriptor = allDescriptors[i];
        delete self[descriptor.prefix][descriptor.shortName];
    }

    if (isNull(descriptorTypesToClear) && isNull(exceptionedDescriptorTypes))
    {

    }
    else
    {
        self.updateDescriptors(filteredDescriptors);
    }
};

/**
 * Replace descriptors with the ones sent as argument
 * MERGE DESCRIPTORS BEFORE CALLING
 * @param descriptors
 */

Resource.prototype.replaceDescriptors = function (newDescriptors, cannotChangeTheseDescriptorTypes, unlessTheyAreOfTheseTypes)
{
    let self = this;
    let currentDescriptors = self.getDescriptors();
    let newDescriptorsUris = [];

    // update descriptors with new ones
    for (let i = 0; i < newDescriptors.length; i++)
    {
        let newDescriptor = newDescriptors[i];
        let newDescriptorPrefix = newDescriptor.prefix;
        let newDescriptorShortName = newDescriptor.shortName;

        if (newDescriptor.isAuthorized(cannotChangeTheseDescriptorTypes, unlessTheyAreOfTheseTypes))
        {
            self[newDescriptorPrefix][newDescriptorShortName] = newDescriptor.value;
            newDescriptorsUris.push(newDescriptor.uri);
        }
    }

    const deletedDescriptors = _.filter(currentDescriptors, function (currentDescriptor)
    {
        return !_.contains(newDescriptorsUris, currentDescriptor.uri);
    });

    // clean other editable descriptors that
    // were not included in
    // changes (means that they need to be deleted)

    for (let i = 0; i < deletedDescriptors.length; i++)
    {
        let deletedDescriptor = deletedDescriptors[i];
        if (deletedDescriptor.isAuthorized(cannotChangeTheseDescriptorTypes, unlessTheyAreOfTheseTypes))
        {
            delete self[deletedDescriptor.getNamespacePrefix()][deletedDescriptor.getShortName()];
        }
    }

    return self;
};

Resource.prototype.getLiteralPropertiesFromOntologies = function (ontologyURIsArray, returnAsFlatArray, callback, customGraphUri)
{
    const self = this;
    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    let argumentsArray = [
        {
            type: Elements.types.resourceNoEscape,
            value: graphUri
        },
        {
            type: Elements.types.resource,
            value: self.uri
        }
    ];

    let fromString = "";
    let filterString = "";

    if (!isNull(ontologyURIsArray))
    {
        const fromElements = DbConnection.buildFromStringAndArgumentsArrayForOntologies(ontologyURIsArray, argumentsArray.length);
        filterString = DbConnection.buildFilterStringForOntologies(ontologyURIsArray, "property");

        argumentsArray = argumentsArray.concat(fromElements.argumentsArray);
        fromString = fromString + fromElements.fromString;
    }

    db.connection.executeViaJDBC(
        "SELECT ?property ?object\n" +
            " FROM [0] \n" +
            fromString + "\n" +
            "WHERE \n" +
            "{ \n" +
                " [1] ?property ?object. \n" +
                " OPTIONAL { \n" +
                "   ?property  rdfs:label      ?label  .\n" +
                    "FILTER (lang(?label) = \"\" || lang(?label) = \"en\")" +
                "}" +
                " OPTIONAL { " +
                "   ?property  rdfs:comment    ?comment ." +
                "   FILTER (lang(?comment) = \"\" || lang(?comment) = \"en\")" +
                "} .\n" +
                " FILTER isLiteral(?object) .\n" +
                filterString +
            "} \n",
        argumentsArray
        ,
        function (err, results)
        {
            if (err)
            {
                const error = "error retrieving literal properties for resource " + self.uri;
                Logger.log(error);
                return callback(1, error);
            }
            if (returnAsFlatArray)
            {
                return callback(null, results);
            }
            const groupPropertiesArrayIntoObject = function (results)
            {
                let properties = null;

                if (results.length > 0)
                {
                    properties = {};

                    for (let i = 0; i < results.length; i++)
                    {
                        const result = results[i];
                        if (isNull(properties[result.property]))
                        {
                            properties[result.property] = [];
                        }

                        properties[result.property].push(decodeURI(result.object));
                    }
                }

                return properties;
            };

            const propertiesObject = groupPropertiesArrayIntoObject(results);
            return callback(null, propertiesObject);
        });
};

Resource.prototype.reindex = function (callback, customGraphUri)
{
    const self = this;
    const errorMessages = [];

    const results = self.getPublicDescriptorsForAPICalls();

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;
    const indexConnection = IndexConnection.getByGraphUri(graphUri);

    let descriptors = [];

    const now = new Date();

    for (let i = 0; i < results.length; i++)
    {
        const result = results[i];
        if (result.value instanceof Array)
        {
            for (let j = 0; j < result.value.length; j++)
            {
                let value = result.value[j];
                descriptors.push({
                    predicate: result.uri,
                    object: value.toString()
                });
            }
        }
        else
        {
            descriptors.push({
                predicate: result.uri,
                object: result.value.toString()
            });
        }
    }
    const document = {
        uri: self.uri,
        graph: indexConnection.uri,
        descriptors: descriptors,
        last_indexing_date: now.toISOString()
    };

    // Logger.log("Reindexing resource " + self.uri);
    // Logger.log("Document: \n" + JSON.stringify(document, null, 4));

    self.getIndexDocumentId(function (err, id)
    {
        if (isNull(err))
        {
            if (!isNull(id))
            {
                document._id = id;
            }

            indexConnection.indexDocument(
                IndexConnection.indexTypes.resource,
                document,
                function (err, result)
                {
                    if (isNull(err))
                    {
                        let msg;
                        if (isNull(id))
                        {
                            msg = self.uri + " resource successfully indexed in index " + indexConnection.short_name;
                        }
                        else
                        {
                            msg = self.uri + " resource successfully REindexed in index " + indexConnection.short_name;
                        }

                        Logger.log("debug", msg);
                        return callback(null, self);
                    }
                    const msg = "Error deleting old document for resource " + self.uri + " error returned " + JSON.stringify(result, null, 4);
                    errorMessages.push(msg);
                    Logger.log("error", msg);
                    return callback(1, errorMessages);
                });
        }
        else
        {
            errorMessages.push("Error getting document id for resource " + self.uri + " error returned " + id);
            return callback(1, errorMessages);
        }
    }, customGraphUri);
};

Resource.prototype.unindex = function (callback, customGraphUri)
{
    const self = this;

    const document = {
        uri: self.uri
    };

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;
    const indexConnection = IndexConnection.getByGraphUri(graphUri);

    self.getIndexDocumentId(function (err, id)
    {
        if (isNull(err))
        {
            if (!isNull(id))
            {
                document._id = id;

                indexConnection.deleteDocument(
                    id,
                    IndexConnection.indexTypes.resource,
                    function (err, result)
                    {
                        if (isNull(err))
                        {
                            const msg = "Resource " + self.uri + "  successfully unindexed in index " + indexConnection.short_name;
                            Logger.log("debug", msg);
                            return callback(null, self);
                        }

                        const msg = "Error deleting old document for resource " + self.uri + " error returned " + JSON.stringify(result, null, 4) + " while unindexing it .";
                        Logger.log("error", msg);
                        return callback(1, self);
                    });
            }
            else
            {
                // resource does not not exist in the index, just return without error, no need to remove it.
                return callback(null, self);
            }
        }
        else
        {
            const msg = "Error getting document id for resource " + self.uri + " error returned " + id + " while unindexing it .";
            Logger.log("error", msg);
            return callback(1, msg);
        }
    });
};

Resource.prototype.getIndexDocumentId = function (callback, customGraphUri)
{
    let self = this;
    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;
    const indexConnection = IndexConnection.getByGraphUri(graphUri);

    // fetch document from the index that matches the current resource
    const queryObject = {
        query: {
            constant_score: {
                filter: {
                    term: {
                        uri: self.uri
                    }
                }
            }
        },
        from: 0,
        size: 200
    };

    indexConnection.search(
        // search in all graphs for resources (generic type)
        IndexConnection.indexTypes.resource,
        queryObject,
        function (err, hits)
        {
            if (isNull(err))
            {
                if (!isNull(hits) && hits instanceof Array && hits.length > 0)
                {
                    if (hits.length > 1)
                    {
                        Logger.log("error", "Duplicate document in index detected for resource !!! Fix it " + self.uri);
                    }
                    let hit = hits[0];
                    if (isNull(hit._id))
                    {
                        let message = "_id value is missing when looking for the index document id for " + self.uri;
                        Logger.log("error", message);
                        return callback(1, message);
                    }

                    return callback(null, hit._id);
                }

                // Resource was not previously indexed
                return callback(null, null);
            }
            return callback(1, [hits]);
        }
    );
};

Resource.prototype.getTextuallySimilarResources = function (callback, maxResultSize, customGraphUri)
{
    let self = this;
    const indexConnection = IndexConnection.getByGraphUri(customGraphUri);

    self.getIndexDocumentId(function (err, id)
    {
        if (isNull(err))
        {
            if (!isNull(id))
            {
                // search in all graphs for resources (generic type)
                indexConnection.moreLikeThis(
                    IndexConnection.indexTypes.resource,
                    id,
                    function (err, results)
                    {
                        if (isNull(err))
                        {
                            let retrievedResources = Resource.restoreFromIndexResults(results);

                            retrievedResources = _.filter(retrievedResources, function (resource)
                            {
                                return resource.uri !== self.uri;
                            });

                            return callback(null, retrievedResources);
                        }
                        return callback(1, [results]);
                    }
                );
            }
            else
            {
                // document is not indexed, therefore has no ID. return empty array as list of similar resources.
                return callback(null, []);
            }
        }
        else
        {
            return callback(1, "Error retrieving similar resources for resource " + self.uri + " : " + id);
        }
    });
};

Resource.getResourceRegex = function (resourceType)
{
    const regex = "^/r/" + resourceType + "/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
    return new RegExp(regex);
};

Resource.findResourcesByTextQuery = function (
    indexConnection,
    queryString,
    resultSkip,
    maxResultSize,
    callback)
{
    const queryObject = {
        query: {
            match: {
                "descriptors.object": {
                    query: queryString
                }
            }
        },
        from: resultSkip,
        size: maxResultSize,
        sort: [
            "_score"
        ]
    };

    Logger.log("debug", "Index Query in JSON : " + JSON.stringify(queryObject, null, 4));

    indexConnection.search(
        // search in all graphs for resources (generic type)
        IndexConnection.indexTypes.resource,
        queryObject,
        function (err, results)
        {
            if (isNull(err))
            {
                let retrievedResources = Resource.restoreFromIndexResults(results);
                return callback(null, retrievedResources);
            }
            return callback(1, [results]);
        }
    );
};

Resource.restoreFromIndexResults = function (hits)
{
    const results = [];

    if (!isNull(hits) && hits.length > 0)
    {
        for (let i = 0; i < hits.length; i++)
        {
            const hit = hits[i];

            const newResult = new Resource({});
            newResult.loadFromIndexHit(hit);

            results.push(newResult);
        }
    }

    results.sort(function (a, b)
    {
        return a.indexData.score - b.indexData.score;
    });

    return results;
};

Resource.prototype.restoreFromIndexDocument = function (callback, customGraphUri)
{
    let self = this;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;
    const indexConnection = IndexConnection.getByGraphUri(graphUri);

    // fetch document from the index that matches the current resource
    const queryObject = {
        query: {
            constant_score: {
                filter: {
                    term: {
                        uri: self.uri
                    }
                }
            }
        },
        from: 0,
        size: 200
    };

    indexConnection.search(
        // search in all graphs for resources (generic type)
        IndexConnection.indexTypes.resource,
        queryObject,
        function (err, hits)
        {
            if (isNull(err))
            {
                if (!isNull(hits) && hits instanceof Array && hits.length > 0)
                {
                    if (hits.length > 1)
                    {
                        Logger.log("error", "Duplicate document in index detected for resource !!! Fix it " + self.uri);
                    }

                    let hit = hits[0];
                    self.loadFromIndexHit(hit);
                }

                return callback(null, self);
            }
            return callback(1, [hits]);
        }
    );
};

Resource.getUriFromHumanReadableUri = function (humanReadableUri, callback, customGraphUri, skipCache)
{
    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    const getFromCache = function (callback)
    {
    // TODO
        return callback(null, null);
    };

    const getFromTripleStore = function (callback)
    {
        db.connection.executeViaJDBC(
            "SELECT ?uri \n" +
            "FROM [0] \n" +
            "WHERE \n" +
            "{ \n" +
            "   ?uri ddr:humanReadableURI [1] \n" +
            "}\n",
            [
                {
                    type: Elements.types.resourceNoEscape,
                    value: graphUri
                },
                {
                    type: Elements.ontologies.ddr.humanReadableURI.type,
                    value: humanReadableUri
                }
            ],
            function (err, results)
            {
                if (isNull(err))
                {
                    if (!isNull(results) && results instanceof Array)
                    {
                        if (results.length === 1)
                        {
                            return callback(null, results[0].uri);
                        }
                        else if (results.length > 1)
                        {
                            return callback(1, "[ERROR] There are more than one internal URIs for the human readable URI " + humanReadableUri + " ! They are : " + JSON.stringify(results));
                        }
                        return callback(null, null);
                    }
                }
                else
                {
                    return callback(err, results);
                }
            });
    };

    if (skipCache)
    {
        getFromTripleStore(function (err, resourceUri)
        {
            callback(err, resourceUri);
        });
    }
    else
    {
        getFromCache(function (err, resourceUri)
        {
            if (isNull(err) && !isNull(resourceUri))
            {
                callback(null, resourceUri);
            }
            else
            {
                getFromTripleStore(function (err, resourceUri)
                {
                    callback(err, resourceUri);
                });
            }
        });
    }
};

Resource.getHumanReadableUriFromUri = function (machineURI, callback, customGraphUri, skipCache)
{
    if (!isNull(machineURI))
    {
        const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

        const getFromCache = function (callback)
        {
            // TODO
            return callback(null, null);
        };

        const getFromTripleStore = function (callback)
        {
            db.connection.executeViaJDBC(
                "SELECT ?human_uri \n" +
                "FROM [0] \n" +
                "WHERE \n" +
                "{ \n" +
                "  [1] ddr:humanReadableURI ?human_uri \n" +
                "}\n",
                [
                    {
                        type: Elements.types.resourceNoEscape,
                        value: graphUri
                    },
                    {
                        type: Elements.types.resourceNoEscape,
                        value: machineURI
                    }
                ],
                function (err, results)
                {
                    if (isNull(err))
                    {
                        if (!isNull(results) && results instanceof Array)
                        {
                            if (results.length === 1)
                            {
                                return callback(null, results[0].human_uri);
                            }
                            else if (results.length > 1)
                            {
                                return callback(1, "[ERROR] There are more than one human readable URI for internal URI  " + machineURI + " ! They are : " + JSON.stringify(results));
                            }

                            return callback(null, null);
                        }
                    }
                    else
                    {
                        return callback(err, results);
                    }
                });
        };

        if (skipCache)
        {
            getFromTripleStore(function (err, resourceUri)
            {
                callback(err, resourceUri);
            });
        }
        else
        {
            getFromCache(function (err, resourceUri)
            {
                if (isNull(err) && !isNull(resourceUri))
                {
                    callback(null, resourceUri);
                }
                else
                {
                    getFromTripleStore(function (err, resourceUri)
                    {
                        callback(err, resourceUri);
                    });
                }
            });
        }
    }
    else
    {
        const msg = "Unable to get a human readable uri when the resource uri is not defined!";
        Logger.log("error", msg);
        callback(1, msg);
    }
};

/**
 * Will fetch all the data pertaining a resource from the last saved information
 * @param uri Uri of the resource to fetch
 * @param callback callback function
 */

Resource.findByUri = function (uri, callback, allowedGraphsArray, customGraphUri, skipCache, descriptorTypesToRemove, descriptorTypesToExemptFromRemoval)
{
    const self = this;

    const getFromCache = function (uri, callback)
    {
        let typesArray;
        if (self.prefixedRDFType instanceof Array)
        {
            typesArray = self.prefixedRDFType;
        }
        else
        {
            typesArray = [self.prefixedRDFType];
        }

        Cache.getByGraphUri(customGraphUri).getByQuery(
            {
                $and: [
                    { uri: uri },
                    {
                        rdf: {
                            type: {
                                $all: typesArray
                            }
                        }
                    }
                ]
            },
            function (err, result)
            {
                if (isNull(err))
                {
                    if (!isNull(result))
                    {
                        const resource = Object.create(self.prototype);

                        resource.uri = uri;

                        // initialize all ontology namespaces in the new object as blank objects
                        // if they are not already present
                        resource.copyOrInitDescriptors(result);

                        if (!isNull(descriptorTypesToRemove) && descriptorTypesToRemove instanceof Array)
                        {
                            resource.clearDescriptors(descriptorTypesToRemove, descriptorTypesToExemptFromRemoval);
                        }

                        return callback(null, resource);
                    }
                    return callback(null, null);
                }
                return callback(err, result);
            });
    };

    const saveToCache = function (uri, resource, callback)
    {
        Cache.getByGraphUri(customGraphUri).put(uri, resource, function (err)
        {
            if (!isNull(err))
            {
                const msg = "Unable to set value of " + resource.uri + " as " + JSON.stringify(resource) + " in cache : " + JSON.stringify(err);
                Logger.log(msg);
            }

            if (typeof callback === "function")
            {
                return callback(null, resource);
            }
        });
    };

    const getFromTripleStore = function (uri, callback, customGraphUri)
    {
        const Ontology = require(Pathfinder.absPathInSrcFolder("/models/meta/ontology.js")).Ontology;

        if (uri instanceof Object && !isNull(uri.uri))
        {
            uri = uri.uri;
        }

        let ontologiesArray;
        if (!isNull(allowedGraphsArray) && allowedGraphsArray instanceof Array)
        {
            ontologiesArray = allowedGraphsArray;
        }
        else
        {
            ontologiesArray = Ontology.getAllOntologiesUris();
        }

        self.exists(uri, function (err, exists)
        {
            if (isNull(err))
            {
                if (exists)
                {
                    const resource = Object.create(self.prototype);
                    // initialize all ontology namespaces in the new object as blank objects
                    // if they are not already present

                    resource.uri = uri;

                    /**
                     * TODO Handle the edge case where there is a resource with the same uri in different graphs in Dendro
                     */
                    resource.loadPropertiesFromOntologies(ontologiesArray, function (err, loadedObject)
                    {
                        if (isNull(err))
                        {
                            resource.baseConstructor(loadedObject);
                            return callback(null, resource);
                        }
                        const msg = "Error while trying to retrieve resource with uri " + self.uri + " from triple store.";
                        Logger.log("error", msg);
                        Logger.log("error", JSON.stringify(resource));
                        return callback(1, msg);
                    }, customGraphUri);
                }
                else
                {
                    if (Config.debug.resources.log_missing_resources)
                    {
                        const msg = uri + " does not exist in Dendro.";
                        Logger.log(msg);
                    }

                    return callback(null, null);
                }
            }
            else
            {
                const msg = "Error " + exists + " while trying to check existence of resource with uri " + uri + " from triple store.";
                Logger.log("error", msg);
                return callback(1, msg);
            }
        }, customGraphUri);
    };

    if (Config.cache.active)
    {
        async.waterfall([
            function (cb)
            {
                getFromCache(uri, function (err, object)
                {
                    cb(err, object);
                });
            },
            function (object, cb)
            {
                if (!isNull(object))
                {
                    const resource = Object.create(self.prototype);
                    resource.uri = uri;

                    resource.copyOrInitDescriptors(object);

                    cb(null, resource);
                }
                else
                {
                    getFromTripleStore(uri, function (err, object)
                    {
                        if (isNull(err))
                        {
                            if (!isNull(object))
                            {
                                saveToCache(uri, object, function (err, result)
                                {
                                    cb(err, object);
                                });
                            }
                            else
                            {
                                cb(err, object);
                            }
                        }
                        else
                        {
                            const msg = "Unable to get resource with uri " + uri + " from triple store.";
                            Logger.log("error", msg);
                            Logger.log("error", err);
                        }
                    }, customGraphUri);
                }
            }
        ], function (err, result)
        {
            return callback(err, result);
        });
    }
    else
    {
        getFromTripleStore(uri, function (err, result)
        {
            return callback(err, result);
        }, customGraphUri);
    }
};

Resource.findByPropertyValue = function (
    descriptor,
    callback,
    allowedGraphsArray,
    customGraphUri,
    skipCache,
    descriptorTypesToRemove,
    descriptorTypesToExemptFromRemoval,
    ignoreArchivedResources
)
{
    const self = this;

    const getFromCache = function (callback)
    {
        let typesArray;
        if (self.prefixedRDFType instanceof Array)
        {
            typesArray = self.prefixedRDFType;
        }
        else
        {
            typesArray = [self.prefixedRDFType];
        }

        let queryObject = {
            $and: [
                {
                    rdf: {
                        type: {
                            $all: typesArray
                        }
                    }
                }
            ]
        };

        const getValueRestriction = function (descriptor)
        {
            let valueRestriction = {};
            valueRestriction[descriptor.prefix] = {};
            valueRestriction[descriptor.prefix][descriptor.shortName] = descriptor.value;
            return valueRestriction;
        };

        if (!isNull(descriptor) && descriptor instanceof Array)
        {
            for (let i = 0; i < descriptor.length; i++)
            {
                queryObject.$and.push(getValueRestriction(descriptor[i]));
            }
        }
        else
        {
            queryObject.$and.push(getValueRestriction(descriptor));
        }

        Cache.getByGraphUri(customGraphUri).getByQuery(
            queryObject,
            function (err, result)
            {
                if (isNull(err))
                {
                    if (!isNull(result))
                    {
                        const resource = Object.create(self.prototype);

                        resource.uri = result.uri;

                        // initialize all ontology namespaces in the new object as blank objects
                        // if they are not already present
                        resource.copyOrInitDescriptors(result);

                        if (!isNull(descriptorTypesToRemove) && descriptorTypesToRemove instanceof Array)
                        {
                            resource.clearDescriptors(descriptorTypesToRemove, descriptorTypesToExemptFromRemoval);
                        }

                        return callback(null, resource);
                    }
                    return callback(null, null);
                }
                return callback(err, result);
            });
    };
    const saveToCache = function (uri, resource, callback)
    {
        Cache.getByGraphUri(customGraphUri).put(uri, resource, function (err)
        {
            if (isNull(err))
            {
                if (typeof callback === "function")
                {
                    return callback(null, resource);
                }
            }
            else
            {
                const msg = "Unable to set value of " + resource.uri + " as " + JSON.stringify(resource) + " in cache : " + JSON.stringify(err);
                Logger.log(msg);
            }
        });
    };
    const getFromTripleStore = function (callback, customGraphUri)
    {
        const Ontology = require(Pathfinder.absPathInSrcFolder("/models/meta/ontology.js")).Ontology;

        let ontologiesArray;
        if (!isNull(allowedGraphsArray) && allowedGraphsArray instanceof Array)
        {
            ontologiesArray = allowedGraphsArray;
        }
        else
        {
            ontologiesArray = Ontology.getAllOntologiesUris();
        }

        const queryTripleStore = function (callback)
        {
            const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

            let typesRestrictions = "";

            let descriptorValueRestrictions = "";
            let descriptorValueArguments = [];

            let types;
            let argumentsOffset = 1;

            if (self.prefixedRDFType instanceof Array)
            {
                types = self.prefixedRDFType;
            }
            else
            {
                types = [self.prefixedRDFType];
            }

            for (let i = 0; i < types.length; i++)
            {
                typesRestrictions = typesRestrictions + "       ?resource_uri rdf:type " + types[i];

                if (i < types.length - 1)
                {
                    typesRestrictions = typesRestrictions + ".\n";
                }
            }

            if (!isNull(ignoreArchivedResources) && ignoreArchivedResources === true)
            {
                typesRestrictions = typesRestrictions + "\nFILTER NOT EXISTS { ?resource_uri rdf:type ddr:ArchivedResource }";
            }

            if (!isNull(descriptor) && descriptor instanceof Array)
            {
                for (let i = 0; i < descriptor.length; i++)
                {
                    descriptorValueRestrictions += "       ?resource_uri  ";

                    descriptorValueArguments.push({
                        type: Elements.types.prefixedResource,
                        value: descriptor[i].getPrefixedForm()
                    });

                    descriptorValueRestrictions += " [" + (argumentsOffset) + "]";
                    argumentsOffset++;

                    descriptorValueArguments.push({
                        type: descriptor[i].type,
                        value: descriptor[i].value
                    });

                    descriptorValueRestrictions += " [" + argumentsOffset + "] . \n";
                    argumentsOffset++;
                }
            }
            else
            {
                descriptorValueRestrictions = "       ?resource_uri [1] [2]. \n";

                descriptorValueArguments.push({
                    type: Elements.types.prefixedResource,
                    value: descriptor.getPrefixedForm()
                });

                descriptorValueArguments.push({
                    type: descriptor.type,
                    value: descriptor.value
                });
            }

            db.connection.executeViaJDBC(
                "SELECT ?resource_uri ?descriptor_uri ?value\n" +
                "FROM [0]\n" +
                "WHERE \n" +
                "{ \n" +
                "   {\n" +
                "       ?resource_uri ?descriptor_uri ?value ." + "\n " +
                        descriptorValueRestrictions +
                        typesRestrictions + "\n " +
                "   }\n" +
                "} \n",

                [
                    {
                        type: Elements.types.resourceNoEscape,
                        value: graphUri
                    }
                ].concat(descriptorValueArguments),
                function (err, descriptors)
                {
                    if (isNull(err))
                    {
                        if (!isNull(descriptors) && descriptors instanceof Array)
                        {
                            if (descriptors.length === 0)
                            {
                                return callback(null, null);
                            }
                            const uris = _.unique(descriptors, function (descriptor)
                            {
                                return descriptor.resource_uri;
                            });

                            if (uris.length > 1)
                            {
                                return callback(1, "[ERROR] There are more than one resources with values " + JSON.stringify(descriptorValueRestrictions) + " ! They are : " + JSON.stringify(uris));
                            }
                            if (uris.length === 1)
                            {
                                const uri = uris[0].resource_uri;
                                if (!isNull(descriptors) && descriptors instanceof Array)
                                {
                                    _.map(descriptors, function (descriptor)
                                    {
                                        descriptor.uri = descriptor.descriptor_uri;
                                        delete descriptor.descriptor_uri;
                                    });

                                    const newResource = Object.create(self.prototype);
                                    newResource.baseConstructor(
                                        {
                                            uri: uri
                                        }
                                    );

                                    newResource.loadObjectWithQueryResults(descriptors, ontologiesArray);
                                    return callback(null, newResource);
                                }
                                return callback(null, null);
                            }
                        }
                        else
                        {
                            return callback(null, null);
                        }
                    }
                    else
                    {
                        const msg = "Error checking for the existence of resource with property value : " + descriptor.value;
                        Logger.log("error", msg);
                        return callback(err, msg);
                    }
                });
        };

        queryTripleStore(function (err, result)
        {
            if (isNull(err))
            {
                if (!isNull(result))
                {
                    return callback(null, result);
                }
                if (Config.debug.resources.log_missing_resources)
                {
                    const msg = "Resource with property " + descriptor.getPrefixedForm() + " of value " + descriptor.value + "  does not exist in Dendro.";
                    Logger.log(msg);
                }

                return callback(null, null);
            }
            let msg;
            if (!(descriptor instanceof Array))
            {
                msg = "Error " + result + " while trying to check existence of resource with value " + descriptor.value + " of property " + descriptor.getPrefixedForm() + " from triple store.";
            }
            else
            {
                let descriptorValues = "";
                for (let i = 0; i < descriptor.length; i++)
                {
                    descriptorValues += descriptor[i].getPrefixedForm() + " : " + descriptor[i].value + " || ";
                }

                msg = "Error " + result + " while trying to check existence of resources with values " + descriptorValues + " from triple store.";
            }

            Logger.log("error", msg);
            return callback(1, msg);
        }, customGraphUri);
    };

    if (Config.cache.active)
    {
        async.waterfall([
            function (cb)
            {
                getFromCache(function (err, object)
                {
                    cb(err, object);
                });
            },
            function (object, cb)
            {
                if (!isNull(object))
                {
                    const resource = Object.create(self.prototype);

                    if (!isNull(object.uri) && isNull(resource.uri))
                    {
                        resource.uri = object.uri;
                    }

                    resource.copyOrInitDescriptors(object);

                    cb(null, resource);
                }
                else
                {
                    getFromTripleStore(function (err, object)
                    {
                        if (isNull(err))
                        {
                            if (!isNull(object))
                            {
                                saveToCache(object.uri, object, function (err)
                                {
                                    cb(err, object);
                                });
                            }
                            else
                            {
                                cb(err, null);
                            }
                        }
                        else
                        {
                            Logger.log("error", object);
                            Logger.log("error", err);
                        }
                    }, customGraphUri);
                }
            }
        ], function (err, result)
        {
            return callback(err, result);
        });
    }
    else
    {
        getFromTripleStore(function (err, result)
        {
            return callback(err, result);
        }, customGraphUri);
    }
};

Resource.prototype.loadFromIndexHit = function (hit)
{
    const self = this;
    const Descriptor = require(Pathfinder.absPathInSrcFolder("/models/meta/descriptor.js")).Descriptor;

    if (isNull(self.indexData))
    {
        self.indexData = {};
    }

    self.indexData.id = hit._id;
    self.indexData.indexId = hit._id;
    self.indexData.score = hit._score;
    self.uri = hit._source.uri;
    self.indexData.graph = hit._source.graph;
    self.indexData.last_indexing_date = hit._source.last_indexing_date;

    let descriptorsAndValues = {};

    for (let i = 0; i < hit._source.descriptors.length; i++)
    {
        let descriptorObject = hit._source.descriptors[i];
        let descriptorUri = descriptorObject.predicate;
        let descriptorValue = descriptorObject.object;

        if (isNull(descriptorsAndValues[descriptorUri]))
        {
            descriptorsAndValues[descriptorUri] = descriptorValue;
        }
        else
        {
            if (typeof descriptorsAndValues[descriptorUri] === "string")
            {
                descriptorsAndValues[descriptorUri] = [descriptorsAndValues[descriptorUri], descriptorValue];
            }
            else if (descriptorsAndValues[descriptorUri] instanceof Array)
            {
                descriptorsAndValues[descriptorUri].push(descriptorValue);
            }
        }
    }

    descriptorsAndValues = _.map(Object.keys(descriptorsAndValues), function (descriptorUri)
    {
        return new Descriptor({
            uri: descriptorUri,
            value: descriptorsAndValues[descriptorUri]
        });
    });

    self.updateDescriptors(descriptorsAndValues);
    return self;
};

Resource.prototype.insertDescriptors = function (newDescriptors, callback, customGraphUri)
{
    const self = this;
    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    db.connection.insertDescriptorsForSubject(self.uri, newDescriptors, graphUri, function (err, result)
    {
        return callback(err, result);
    });
};

Resource.prototype.getArchivedVersions = function (offset, limit, callback, customGraphUri)
{
    const self = this;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    let query =
        "WITH [0] \n" +
        "SELECT ?uri ?version_number\n" +
        "WHERE \n" +
        "{ \n" +
        "   ?uri rdf:type ddr:ArchivedResource. \n" +
        "   ?uri ddr:isVersionOf [1]. \n" +
        "   ?uri ddr:versionNumber ?version_number. \n" +
        "}\n" +
        "ORDER BY DESC(?version_number)\n";

    if (!isNull(limit) && limit > 0)
    {
        query = query + " LIMIT " + limit + "\n";
    }

    if (!isNull(offset) && offset > 0)
    {
        query = query + " OFFSET " + limit + "\n";
    }

    db.connection.executeViaJDBC(query,
        [
            {
                value: graphUri,
                type: Elements.types.resourceNoEscape
            },
            {
                value: self.uri,
                type: Elements.types.resource
            }
        ], function (err, versions)
        {
            if (isNull(err))
            {
                const getVersionContents = function (versionRow, cb)
                {
                    const ArchivedResource = require(Pathfinder.absPathInSrcFolder("/models/versions/archived_resource.js")).ArchivedResource;
                    ArchivedResource.findByUri(versionRow.uri, function (err, archivedResource)
                    {
                        cb(err, archivedResource);
                    }, null, customGraphUri);
                };

                async.mapSeries(versions, getVersionContents, function (err, formattedVersions)
                {
                    if (isNull(err))
                    {
                        return callback(null, formattedVersions);
                    }
                    const error = "Error occurred fetching data about a past version of resource " + self.uri + ". Error returned : " + formattedVersions;
                    Logger.log("error", error);
                    return callback(1, error);
                });
            }
            else
            {
                const error = "Error occurred fetching versions of resource " + self.uri + ". Error returned : " + versions;
                Logger.log("error", error);
                return callback(1, error);
            }
        });
};

Resource.prototype.getLatestArchivedVersion = function (callback)
{
    const self = this;
    self.getArchivedVersions(0, 1, function (err, latestRevisionArray)
    {
        if (isNull(err) && latestRevisionArray instanceof Array && latestRevisionArray.length === 1)
        {
            return callback(null, latestRevisionArray[0]);
        }
        else if (isNull(err) && latestRevisionArray instanceof Array && latestRevisionArray.length === 0)
        {
            return callback(null, null);
        }
        const error = "Error occurred fetching latest version of resource " + self.uri + ". Error returned : " + latestRevisionArray;
        Logger.log("error", error);
        return callback(1, error);
    });
};

Resource.prototype.makeArchivedVersion = function (entitySavingTheResource, callback)
{
    const self = this;
    self.getLatestArchivedVersion(function (err, latestArchivedVersion)
    {
        if (isNull(err))
        {
            let newVersionNumber;
            if (isNull(latestArchivedVersion))
            {
                newVersionNumber = 0;
            }
            else
            {
                newVersionNumber = latestArchivedVersion.ddr.versionNumber + 1;
            }

            // create a clone of the object parameter (note that all functions of the original object are not cloned,
            // but we dont care in this case
            // (http://stackoverflow.com/questions/122102/most-efficient-way-to-clone-an-object)
            const objectValues = JSON.parse(JSON.stringify(self));

            let versionCreator;
            if (!isNull(entitySavingTheResource))
            {
                versionCreator = entitySavingTheResource;
            }
            else
            {
                const User = require(Pathfinder.absPathInSrcFolder("/models/user.js")).User;
                versionCreator = User.anonymous.uri;
            }

            delete objectValues.uri;
            objectValues.ddr.versionCreator = versionCreator;
            objectValues.ddr.isVersionOf = self.uri;
            objectValues.ddr.versionNumber = newVersionNumber;
            objectValues.ddr.humanReadableURI = self.ddr.humanReadableURI + "/version/" + newVersionNumber;

            const ArchivedResource = require(Pathfinder.absPathInSrcFolder("/models/versions/archived_resource.js")).ArchivedResource;
            const archivedResource = new ArchivedResource(objectValues);

            return callback(null, archivedResource);
        }
        const error = "Error occurred creating a new archived version of resource " + self.uri + ". Error returned : " + latestArchivedVersion;
        Logger.log("error", error);
        return callback(1, error);
    });
};

Resource.prototype.getURIsOfCurrentDescriptors = function (descriptorTypesNotToGet, descriptorTypesToForcefullyGet)
{
    const self = this;
    let currentDescriptors = self.getDescriptors(descriptorTypesNotToGet, descriptorTypesToForcefullyGet);
    let currentDescriptorURIs = [];

    for (let i = 0; i < currentDescriptors.length; i++)
    {
        currentDescriptorURIs.push(currentDescriptors[i].uri);
    }

    return currentDescriptorURIs;
};

Resource.prototype.getPublicDescriptorsForAPICalls = function ()
{
    const self = this;
    return self.getDescriptors([Elements.access_types.locked, Elements.access_types.private], [Elements.access_types.api_readable]);
};

Resource.prototype.getDescriptors = function (descriptorTypesNotToGet, descriptorTypesToForcefullyGet, typeConfigsToRetain)
{
    const Descriptor = require(Pathfinder.absPathInSrcFolder("/models/meta/descriptor.js")).Descriptor;
    const self = this;
    let descriptorsArray = [];

    for (let prefix in Elements.ontologies)
    {
        if (Elements.ontologies.hasOwnProperty(prefix) && self.hasOwnProperty(prefix))
        {
            for (let shortName in self[prefix])
            {
                if (self[prefix].hasOwnProperty(shortName))
                {
                    const newDescriptor = new Descriptor(
                        {
                            prefix: prefix,
                            shortName: shortName,
                            value: self[prefix][shortName]
                        },
                        typeConfigsToRetain
                    );

                    if (newDescriptor.isAuthorized(descriptorTypesNotToGet, descriptorTypesToForcefullyGet))
                    {
                        descriptorsArray.push(newDescriptor);
                    }
                }
            }
        }
    }

    return descriptorsArray;
};

/**
 * Calculates the differences between the descriptors in this resource and the one supplied as an argument
 * @param anotherResource
 */
Resource.prototype.calculateDescriptorDeltas = function (newResource, descriptorsToExclude)
{
    const Descriptor = require(Pathfinder.absPathInSrcFolder("/models/meta/descriptor.js")).Descriptor;
    const Ontology = require(Pathfinder.absPathInSrcFolder("/models/meta/ontology.js")).Ontology;

    const self = this;
    let deltas = [];

    const ontologies = Ontology.getAllOntologyPrefixes();
    let changeIndex = 0;

    const instanceOfBaseType = function (value)
    {
        return (typeof value === "string" || typeof value === "boolean" || typeof value === "number");
    };

    const pushDelta = function (deltas, prefix, shortName, oldValue, newValue, changeType, changeIndex)
    {
        const d = new Descriptor(
            {
                prefix: prefix,
                shortName: shortName
            }
        );

        if (!isNull(descriptorsToExclude))
        {
            if (!Descriptor.isAuthorized(prefix, shortName, descriptorsToExclude))
            {
                return deltas;
            }
        }

        const Change = require(Pathfinder.absPathInSrcFolder("/models/versions/change.js")).Change;

        const newChange = new Change({
            ddr: {
                changedDescriptor: d.uri,
                oldValue: oldValue,
                newValue: newValue,
                changeType: changeType,
                changeIndex: changeIndex
            }
        });

        deltas = deltas.concat([newChange]);
        return deltas;
    };

    for (let i = 0; i < ontologies.length; i++)
    {
        let prefix = ontologies[i];
        const descriptors = Elements.ontologies[prefix];

        for (let descriptor in descriptors)
        {
            if (descriptors.hasOwnProperty(descriptor) && Descriptor.isAuthorized(prefix, descriptor, descriptorsToExclude))
            {
                /*
                 oldValue = current
                 newValue = new
                 */

                let oldValue = null;
                if (!isNull(self[prefix]) && !isNull(self[prefix][descriptor]))
                {
                    oldValue = self[prefix][descriptor];
                }

                let newValue = null;
                if (!isNull(newResource[prefix]) && !isNull(newResource[prefix][descriptor]))
                {
                    newValue = newResource[prefix][descriptor];
                }

                if (isNull(oldValue) && !isNull(newValue))
                {
                    deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "add", changeIndex++);
                }
                else if (!isNull(oldValue) && isNull(newValue))
                {
                    deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "delete", changeIndex++);
                }
                else if (!isNull(oldValue) && !isNull(newValue))
                {
                    if (instanceOfBaseType(newValue) && oldValue instanceof Array)
                    {
                        let intersection = _.intersection([newValue], oldValue);

                        if (intersection.length === 0)
                        {
                            deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "delete_edit", changeIndex++);
                        }
                        else
                        {
                            deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "delete", changeIndex++);
                        }
                    }
                    else if (newValue instanceof Array && instanceOfBaseType(oldValue))
                    {
                        let intersection = _.intersection([oldValue], newValue);

                        if (intersection.length === 0)
                        {
                            deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "add_edit", changeIndex++);
                        }
                        else
                        {
                            deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "add", changeIndex++);
                        }
                    }
                    else if (instanceOfBaseType(oldValue) && instanceOfBaseType(newValue))
                    {
                        if (!(oldValue === newValue))
                        {
                            deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "edit", changeIndex++);
                        }
                    }
                    else if (oldValue instanceof Array && newValue instanceof Array)
                    {
                        if (oldValue.length === newValue.length)
                        {
                            let intersection = _.intersection(newValue, oldValue);

                            if (intersection.length !== oldValue.length || intersection.length !== newValue.length)
                            {
                                deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "edit", changeIndex++);
                            }
                        }
                        else if (oldValue.length < newValue.length)
                        {
                            let intersection = _.intersection(newValue, oldValue);

                            if (intersection.length < oldValue.length)
                            {
                                deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "add_edit", changeIndex++);
                            }
                            else
                            {
                                deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "add", changeIndex++);
                            }
                        }
                        else if (oldValue.length > newValue.length)
                        {
                            let intersection = _.intersection(newValue, oldValue);

                            if (intersection.length < newValue.length)
                            {
                                deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "delete_edit", changeIndex++);
                            }
                            else
                            {
                                deltas = pushDelta(deltas, prefix, descriptor, oldValue, newValue, "delete", changeIndex++);
                            }
                        }
                    }
                }
            }
        }
    }

    return deltas;
};

Resource.prototype.checkIfHasPredicateValue = function (predicateInPrefixedForm, value, callback, customGraphUri)
{
    const self = this;
    const Descriptor = require(Pathfinder.absPathInSrcFolder("/models/meta/descriptor.js")).Descriptor;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    const descriptorToCheck = new Descriptor({
        prefixedForm: predicateInPrefixedForm,
        value: value
    });

    if (descriptorToCheck instanceof Descriptor)
    {
        const checkInTripleStore = function (callback)
        {
            const query =
                "WITH [0] \n" +
                "ASK {" +
                "[1] [2] [3] ." +
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
                        type: Elements.types.prefixedResource,
                        value: descriptorToCheck.getPrefixedForm()
                    },
                    {
                        type: descriptorToCheck.type,
                        value: value
                    }
                ],
                function (err, result)
                {
                    if (isNull(err))
                    {
                        if (result instanceof Array && result.length > 0)
                        {
                            return callback(null, true);
                        }
                        return callback(null, false);
                    }
                    const msg = "Error verifying existence of triple \"" + self.uri + " " + predicateInPrefixedForm + " " + value + "\". Error reported " + JSON.stringify(result);
                    if (Config.debug.resources.log_all_type_checks === true)
                    {
                        Logger.log("error", msg);
                    }
                    return callback(err, msg);
                });
        };

        Cache.getByGraphUri(customGraphUri).get(self.uri, function (err, cachedResource)
        {
            if (isNull(err) && !isNull(cachedResource))
            {
                const namespace = descriptorToCheck.getNamespacePrefix();
                const element = descriptorToCheck.getShortName();
                if (
                    !isNull(cachedResource[namespace]) &&
                   !isNull(cachedResource[namespace][element])
                )
                {
                    let descriptorValue = cachedResource[namespace][element];
                    if (descriptorValue instanceof Array)
                    {
                        if (descriptorToCheck.type === Elements.types.prefixedResource)
                        {
                            let values = cachedResource[namespace][element];
                            let valueToTest = Descriptor.getUriFromPrefixedForm(value);
                            return callback(null, _.contains(values, valueToTest));
                        }
                        return callback(null, _.contains(cachedResource[namespace][element], value));
                    }
                    else if (typeof descriptorValue === "string")
                    {
                        if (descriptorToCheck.type === Elements.types.prefixedResource)
                        {
                            return callback(null, (Descriptor.getUriFromPrefixedForm(value) === value));
                        }
                        return callback(null, (descriptorValue === value));
                    }
                    return callback(1, "Unable to determine type of descriptor from cached object when determining if resource " + self.uri + " has predicate " + predicateInPrefixedForm + " with a value of" + value);
                }
                checkInTripleStore(callback);
            }
            else
            {
                checkInTripleStore(callback);
            }
        });
    }
    else
    {
        Logger.log("error", "Attempting to check the value of an unknown descriptor " + predicateInPrefixedForm + " for resource " + self.uri);
        return false;
    }
};

Resource.prototype.restoreFromArchivedVersion = function (version, callback, uriOfUserPerformingRestore)
{
    const self = this;

    const typesToExclude = [
        Elements.access_types.locked,
        Elements.access_types.audit,
        Elements.access_types.private
    ];

    const oldDescriptors = version.getDescriptors(typesToExclude);

    self.replaceDescriptors(oldDescriptors, typesToExclude);

    self.save(
        callback,
        true,
        uriOfUserPerformingRestore,
        [
            Elements.access_types.locked
        ]);
};

Resource.prototype.getLogicalParts = function (callback)
{
    const self = this;
    const fs = require("fs");
    const Folder = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/folder.js")).Folder;
    const File = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/file.js")).File;

    const childFoldersQuery =
        "SELECT ?uri\n" +
        "FROM [0] \n" +
        "WHERE \n" +
        "{ \n" +
        "   [1] nie:hasLogicalPart ?uri . \n" +
        "   ?uri rdf:type nfo:Folder  \n" +
        "} \n";

    const childFilesQuery =
        "SELECT ?uri\n" +
        "FROM [0] \n" +
        "WHERE \n" +
        "{ \n" +
        "   [1] nie:hasLogicalPart ?uri . \n" +
        "   ?uri rdf:type nfo:FileDataObject \n" +
        "} \n";

    async.mapSeries([
        {
            query: childFoldersQuery,
            childClass: Folder
        },
        {
            query: childFilesQuery,
            childClass: File
        }
    ], function (argument, callback)
    {
        db.connection.executeViaJDBC(argument.query,
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
            function (err, children)
            {
                if (isNull(err))
                {
                    if (!isNull(children) && children instanceof Array)
                    {
                        const getChildrenProperties = function (child, cb)
                        {
                            argument.childClass.findByUri(child.uri, function (err, child)
                            {
                                cb(err, child);
                            });
                        };

                        async.mapSeries(children, getChildrenProperties, function (err, children)
                        {
                            if (isNull(err))
                            {
                                return callback(null, children);
                            }
                            return callback(err, children);
                        });
                    }
                    else
                    {
                        return callback(1, "Unable to retrieve Information Element's metadata " + children);
                    }
                }
            });
    }, function (err, results)
    {
        if (err)
        {
            callback(err, results);
        }
        else
        {
            callback(err, _.flatten(results));
        }
    });
};

Resource.prototype.findMetadataRecursive = function (callback, typeConfigsToRetain)
{
    const self = this;
    self.findMetadata(callback, typeConfigsToRetain, true);
};

Resource.prototype.findMetadata = function (callback, typeConfigsToRetain, recursive)
{
    const self = this;
    const async = require("async");
    const myDescriptors = self.getDescriptors(
        [Elements.access_types.private, Elements.access_types.locked], [Elements.access_types.api_readable], typeConfigsToRetain
    );

    if (!isNull(myDescriptors) && myDescriptors instanceof Array)
    {
        const metadataResult = {
            title: self.nie.title,
            descriptors: myDescriptors,
            metadata_quality: self.ddr.metadataQuality | 0,
            file_extension: self.ddr.fileExtension,
            hasLogicalParts: []
        };

        self.getLogicalParts(function (err, children)
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
                                child.findMetadata(function (err, result2)
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
                }
                else
                {
                    return callback(null, metadataResult);
                }
            }
            else
            {
                Logger.log("error", "[findMetadata] error accessing logical parts of folder " + self.nie.title);
                Logger.log("error", err);
                return callback(true, null);
            }
        });
    }
    else
    {
        return callback(err, resource);
    }
};

Resource.prototype.isOfClass = function (classNameInPrefixedForm, callback)
{
    const self = this;
    self.checkIfHasPredicateValue("rdf:type", classNameInPrefixedForm, function (err, isOfClass)
    {
        if (Config.debug.active && Config.debug.resources.log_all_type_checks)
        {
            if (isOfClass)
            {
                Logger.log("Resource " + self.uri + " IS of type " + classNameInPrefixedForm);
            }
            else
            {
                Logger.log("Resource " + self.uri + " IS NOT of type " + classNameInPrefixedForm);
            }
        }
        return callback(err, isOfClass);
    });
};

Resource.randomInstance = function (typeInPrefixedFormat, callback, customGraphUri)
{
    const self = this;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    async.waterfall([
        function (callback)
        {
            db.connection.executeViaJDBC(
                "SELECT (count(?s) as ?c) \n" +
                    "FROM [0] \n" +
                    "WHERE \n" +
                    "{ \n" +
                        "?s ?p ?o . \n" +
                        "?s rdf:type [1] \n" +
                        " FILTER NOT EXISTS " +
                        "{ \n" +
                        "   ?s ddr:isVersionOf ?version .\n" +
                        "} \n" +
                    "}\n",
                [
                    {
                        type: Elements.types.resourceNoEscape,
                        value: graphUri
                    },
                    {
                        type: Elements.ontologies.rdf.type,
                        value: typeInPrefixedFormat
                    }
                ],
                function (err, results)
                {
                    if (isNull(err))
                    {
                        const randomNumber = Math.floor(Math.random() * (results[0].c - 1));
                        return callback(null, randomNumber);
                    }
                    return callback(err, results);
                });
        },
        function (randomNumber, callback)
        {
            db.connection.executeViaJDBC(
                "SELECT ?s \n" +
                "FROM [0] \n" +
                "WHERE \n" +
                "{ \n" +
                    "?s ?p ?o . \n" +
                    "?s rdf:type [2] \n" +
                    " FILTER NOT EXISTS " +
                    "{ \n" +
                    "   ?s ddr:isVersionOf ?version .\n" +
                    "} \n" +
                "} \n" +
                "ORDER BY ?s \n" +
                "OFFSET [1] \n" +
                "LIMIT 1 \n",
                [
                    {
                        type: Elements.types.resourceNoEscape,
                        value: graphUri
                    },
                    {
                        type: Elements.types.int,
                        value: randomNumber
                    },
                    {
                        type: Elements.ontologies.rdf.type.type,
                        value: typeInPrefixedFormat
                    }
                ],
                function (err, result)
                {
                    if (isNull(err))
                    {
                        const randomResourceUri = result[0].s;
                        self.findByUri(randomResourceUri, function (err, result)
                        {
                            return callback(err, result);
                        });
                    }
                    else
                    {
                        return callback(err, null);
                    }
                });
        }
    ], function (err, randomResourceInstance)
    {
        return callback(err, randomResourceInstance);
    });
};

Resource.deleteAll = function (callback, customGraphUri)
{
    const self = this;
    const type = self.prefixedRDFType;

    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    const queryArguments = [
        {
            type: Elements.types.resourceNoEscape,
            value: graphUri
        }
    ];

    let query =
        "WITH [0] \n" +
        "DELETE { ?uri ?p ?o} \n" +
        "WHERE { \n" +
        "?uri ?p ?v. \n";

    if (!isNull(type))
    {
        let rdfTypes;

        if (!(self.prefixedRDFType instanceof Array))
        {
            rdfTypes = [self.prefixedRDFType];
        }
        else
        {
            rdfTypes = self.prefixedRDFType;
        }

        let argumentCount = 1;
        let typeRestrictions = "";
        for (let i = 0; i < rdfTypes.length; i++)
        {
            typeRestrictions = typeRestrictions + " ?uri rdf:type [" + argumentCount + "]";
            argumentCount++;

            queryArguments.push({
                type: Elements.ontologies.rdf.type.type,
                value: self.prefixedRDFType[i]
            });

            if (i < rdfTypes.length - 1)
            {
                typeRestrictions += ".\n";
            }
            else
            {
                typeRestrictions += "\n";
            }
        }

        query = query + typeRestrictions;
    }

    query = query + "} \n";

    Cache.getByGraphUri(graphUri).deleteAlByType(self.prefixedRDFType, function (err, result)
    {
        if (isNull(err))
        {
            db.connection.executeViaJDBC(
                query,
                queryArguments,
                function (err, result)
                {
                    if (isNull(err))
                    {
                        return callback(null, "All resources of type " + self.prefixedRDFType + " deleted successfully.");
                    }
                    return callback(1, "Unable to fetch all resources from the graph");
                });
        }
        else
        {
            return callback(1, "Unable to delete all the resources of type " + self.prefixedRDFType + " from cache.");
        }
    });
};

Resource.deleteAllWithCertainDescriptorValueAndTheirOutgoingTriples = function (descriptor, callback, customGraphUri)
{
    const async = require("async");
    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    const pagedFetchResourcesWithDescriptor = function (descriptor, page, pageSize, callback)
    {
        const offset = pageSize * page;

        db.connection.executeViaJDBC(
            "WITH [0] \n" +
            "SELECT ?uri \n" +
            "WHERE \n" +
            "{ \n" +
            "   ?uri [1] [2] \n" +
            "} \n" +
            "LIMIT [3] \n" +
            "OFFSET [4] \n",
            [
                {
                    type: Elements.types.resourceNoEscape,
                    value: graphUri
                },
                {
                    type: Elements.types.prefixedResource,
                    value: descriptor.getPrefixedForm()
                },
                {
                    type: descriptor.type,
                    value: descriptor.value
                },
                {
                    type: Elements.types.int,
                    value: pageSize
                },
                {
                    type: Elements.types.int,
                    value: offset
                }
            ],
            function (err, result)
            {
                return callback(err, result);
            }
        );
    };

    const deleteAllCachedResourcesWithDescriptorValue = function (descriptor, page, pageSize, callback)
    {
        pagedFetchResourcesWithDescriptor(descriptor, page, pageSize, function (err, results)
        {
            if (isNull(err))
            {
                if (results instanceof Array)
                {
                    const resourceUris = [];
                    for (let i = 0; i < results.length; i++)
                    {
                        resourceUris.push(results[i].uri);
                    }

                    if (resourceUris.length > 0)
                    {
                        Cache.getByGraphUri(customGraphUri).delete(resourceUris, function (err, result)
                        {
                            if (isNull(err))
                            {
                                if (resourceUris.length === pageSize)
                                {
                                    page++;
                                    deleteAllCachedResourcesWithDescriptorValue(descriptor, page, pageSize, callback);
                                }
                                else
                                {
                                    return callback(null, null);
                                }
                            }
                            else
                            {
                                return callback(err, result);
                            }
                        });
                    }
                    else
                    {
                        return callback(null, null);
                    }
                }
                else
                {
                    return callback(1, "Unable to delete resources with descriptor " + descriptor.getPrefixedForm() + " and value" + descriptor.value + " from cache.");
                }
            }
        });
    };

    // TODO CACHE DONE

    deleteAllCachedResourcesWithDescriptorValue(descriptor, 0, Config.limits.db.pageSize, function (err)
    {
        if (isNull(err))
        {
            db.connection.executeViaJDBC(
                "WITH [0]\n" +
                "DELETE \n" +
                "WHERE \n" +
                "{ \n" +
                "   ?s [1] [2]. \n" +
                "   ?s ?p ?o \n" +
                "} \n",

                [
                    {
                        type: Elements.types.resourceNoEscape,
                        value: graphUri
                    },
                    {
                        type: Elements.types.prefixedResource,
                        value: descriptor.getPrefixedForm()
                    },
                    {
                        type: descriptor.type,
                        value: descriptor.value
                    }
                ],
                function (err, results)
                {
                    if (isNull(err))
                    {
                        return callback(null, results);
                    }
                    const msg = "Error deleting all resources of type with descriptor " + descriptor.getPrefixedForm() + " and value" + descriptor.value + " and their outgoing triples. Error returned: " + JSON.stringify(results);
                    Logger.log("error", msg);
                    return callback(err, msg);
                });
        }
        else
        {
            const msg = "Error deleting all CACHED resources of type with descriptor " + descriptor.getPrefixedForm() + " and value" + descriptor.value + " and their outgoing triples. Error returned: " + JSON.stringify(err);
            Logger.log("error", msg);
            return callback(err, msg);
        }
    });
};

Resource.prototype.deleteAllOfMyTypeAndTheirOutgoingTriples = function (callback, customGraphUri)
{
    const self = this;
    const type = self.rdf.type;

    self.uri = object.uri;
    self.prefix = self.getNamespacePrefix();
    self.ontology = self.getOwnerOntologyUri();
    self.shortName = self.getShortName();
    self.prefixedForm = self.getPrefixedForm();

    const typeDescriptor = new Descriptor(
        {
            prefixedForm: "rdf:type",
            value: type
        }
    );

    Resource.deleteAllWithCertainDescriptorValueAndTheirOutgoingTriples(typeDescriptor, callback, customGraphUri);
};

Resource.prototype.addURIAndRDFType = function (object, resourceTypeSection, classPrototype)
{
    const self = this;

    if (isNull(self.rdf))
    {
        self.rdf = {};
    }

    if (isNull(self.rdf.type))
    {
        self.rdf.type = classPrototype.prefixedRDFType;
    }

    if (isNull(object.uri))
    {
        if (isNull(self.uri))
        {
            const uuid = require("uuid");
            self.uri = "/r/" + resourceTypeSection + "/" + uuid.v4();
        }
    }
    else
    {
        if (isNull(self.uri))
        {
            self.uri = object.uri;
        }
    }

    return self;
};

Resource.prototype.isA = function (prototype)
{
    let self = this;

    const getFullUri = function (prefixedForm)
    {
        if (validator.isURL(prefixedForm))
        {
            return prefixedForm;
        }

        const prefix = prefixedForm.split(":")[0];
        const shortName = prefixedForm.split(":")[1];
        const Ontology = require(Pathfinder.absPathInSrcFolder("/models/meta/ontology.js")).Ontology;
        return Ontology.allOntologies[prefix].uri + shortName;
    };

    let myRDFType = self.rdf.type;
    let objectRDFType = prototype.prefixedRDFType;

    if (myRDFType instanceof Array)
    {
        myRDFType = _.map(myRDFType, getFullUri);
    }
    else
    {
        myRDFType = getFullUri(myRDFType);
    }

    if (objectRDFType instanceof Array)
    {
        objectRDFType = _.map(objectRDFType, getFullUri);
    }
    else
    {
        objectRDFType = getFullUri(objectRDFType);
    }

    if (!isNull(self.rdf.type))
    {
        if (!isNull(prototype.prefixedRDFType))
        {
            if (typeof objectRDFType === "string" && typeof myRDFType === "string")
            {
                return (objectRDFType === myRDFType);
            }
            else if (objectRDFType instanceof Array && myRDFType instanceof Array)
            {
                if (objectRDFType.length !== myRDFType.length)
                {
                    return false;
                }

                const myRDFTypeSorted = _.uniq(myRDFType.sort(), true);
                const objectRDFTypeSorted = _.uniq(objectRDFType.sort(), true);

                return _.isEqual(myRDFTypeSorted, objectRDFTypeSorted);
            }

            return false;
        }

        throw new Error("Unable to determine rdf:type of " + prototype.name);
    }
    else
    {
        throw new Error("Unable to determine rdf:type of " + self.uri);
    }
};

Resource.arrayToCSVFile = function (resourceArray, fileName, callback)
{
    const File = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/file.js")).File;

    File.createBlankTempFile(fileName, function (err, tempFileAbsPath)
    {
        return callback(err, tempFileAbsPath);

    /* var fs = require('fs');

         //clear file
         fs.writeFile(tempFileAbsPath, '', function(){

         //write to file

         var writeCSVLineToFile = function(resource, cb)
         {
         var csvLine = resource.toCSVLine();
         fs.appendFile(tempFileAbsPath, csvLine, cb);
         };

         async.mapSeries(resourceArray, writeCSVLineToFile, function(err, results){
         return callback(err, tempFileAbsPath);
         });
         }); */
    });
};

Resource.getCount = function (callback)
{
    const self = this;

    let totalCount;
    let rdfTypes;

    let queryArguments = [
        {
            type: Elements.types.resourceNoEscape,
            value: db.graphUri
        }
    ];

    if (!(self.prefixedRDFType instanceof Array))
    {
        rdfTypes = [self.prefixedRDFType];
    }
    else
    {
        rdfTypes = self.prefixedRDFType;
    }

    let argumentCount = 1;
    let typeRestrictions = "";
    for (let i = 0; i < rdfTypes.length; i++)
    {
        typeRestrictions = typeRestrictions + " ?uri rdf:type [" + argumentCount + "]";
        queryArguments.push({
            type: Elements.ontologies.rdf.type.type,
            value: self.prefixedRDFType[i]
        });

        argumentCount++;

        if (i < rdfTypes.length - 1)
        {
            typeRestrictions += ".\n";
        }
        else
        {
            typeRestrictions += "\n";
        }
    }

    const countQuery =
        "SELECT \n" +
        "COUNT(?uri) as ?count \n" +
        "FROM [0] \n" +
        "WHERE \n" +
        "{ \n" +
            typeRestrictions +
        "}\n";

    db.connection.executeViaJDBC(
        countQuery,
        queryArguments,
        function (err, count)
        {
            if (isNull(err))
            {
                if (!isNull(count))
                {
                    if (count instanceof Array)
                    {
                        if (count.length >= 1 && !isNull(count[0]) && !isNull(count[0].count))
                        {
                            totalCount = parseInt(count[0].count);
                            return callback(null, totalCount);
                        }

                        return callback(1, "Unable to fetch the number of resources of type " + JSON.stringify(rdfTypes) + ". The count object is an Array but does not contain the 'count' property or has length 0.");
                    }
                    else if (!isNull(count.count))
                    {
                        return callback(null, parseInt(count.count));
                    }

                    return callback(2, "Unable to fetch the number of resources of type " + JSON.stringify(rdfTypes) + ". The count object is not an Array and does not contain the 'count' property.");
                }

                return callback(3, "Unable to fetch the number of resources of type " + JSON.stringify(rdfTypes) + ". The count object is null!");
            }

            return callback(err, count);
        }
    );
};

Resource.prototype.getHumanReadableUri = function (callback)
{
    const self = this;
    const myIdentifier = self.uri.match("/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    if (!isNull(myIdentifier) && myIdentifier instanceof Array && myIdentifier.length === 1)
    {
        callback(null, "/resource/" + myIdentifier[0].substr(1));
    }
    else
    {
        callback(1, "Unable to retrieve human-readable URI of resource " + self.uri + " because it has no UUID");
    }
};

Resource.prototype.refreshHumanReadableUri = function (callback, customGraphUri)
{
    const self = this;
    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    self.getHumanReadableUri(
        function (err, newHumanReadableUri)
        {
            if (isNull(err))
            {
                self.ddr.humanReadableURI = newHumanReadableUri;
                self.save(function (err, result)
                {
                    if (isNull(err))
                    {
                        callback(err, self);
                    }
                    else
                    {
                        callback(err, result);
                    }
                },
                false,
                null,
                null,
                null,
                null,
                graphUri
                );
            }
            else
            {
                callback(1, "Unable to determine new human readable uri for resource " + newResource.uri);
            }
        }
    );
};

Resource = Class.extend(Resource, Class, "ddr:Resource");

module.exports.Resource = Resource;
