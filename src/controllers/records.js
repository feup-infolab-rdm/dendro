var Config = function() { return GLOBAL.Config; }();

var Resource = require(Config.absPathInSrcFolder("/models/resource.js")).Resource;
var Ontology = require(Config.absPathInSrcFolder("/models/meta/ontology.js")).Ontology;
var ArchivedResource = require(Config.absPathInSrcFolder("/models/versions/archived_resource.js")).ArchivedResource;
var InformationElement = require(Config.absPathInSrcFolder("/models/directory_structure/information_element.js")).InformationElement;
var Descriptor = require(Config.absPathInSrcFolder("/models/meta/descriptor.js")).Descriptor;
var Project = require(Config.absPathInSrcFolder("/models/project.js")).Project;

var db = function() { return GLOBAL.db.default; }();
var gfs = function() { return GLOBAL.gfs.default; }();

var _ = require('underscore');
var request = require('request');

var self = this;

exports.show_deep = function(req, res) {
    var acceptsHTML = req.accepts('html');
    var acceptsJSON = req.accepts('json');

    if(!acceptsJSON && acceptsHTML)
    {
        res.status(400).json({
            result: "error",
            message : "HTML Request not valid for this route."
        });
    }
    else
    {
        if(req.params.filepath != null)
        {
            var requestedResource = new Resource({
                uri : req.params.requestedResource
            });

            requestedResource.findMetadataRecursive(function(err, result){
                if(!err){

                    var accept = req.header('Accept');
                    var serializer = null;
                    var contentType = null;
                    if(accept == null || accept in Config.metadataSerializers == false)
                    {
                        serializer = Config.defaultMetadataSerializer;
                        contentType = Config.defaultMetadataContentType;
                    }
                    else{
                        serializer = Config.metadataSerializers[accept];
                        contentType = Config.metadataContentTypes[accept];
                    }

                    res.set('Content-Type', contentType);
                    res.send(serializer(result));

                }
                else{
                    res.status(500).json({
                        error_messages : "Error finding metadata from " + requestedResource.uri + "\n" + result
                    });
                }
            });
        }
        else
        {
            res.status(400).json({
                result: "error",
                message : "filepath parameter was not specified."
            });
        }
    }
};

exports.show = function(req, res) {
    var acceptsHTML = req.accepts('html');
    var acceptsJSON = req.accepts('json');

    if(!acceptsJSON && acceptsHTML)
    {
        res.status(400).json({
            result: "error",
            message : "HTML Request not valid for this route."
        });
    }
    else
    {
        var requestedResourceURI = req.params.requestedResource;

        var requestedResource = new InformationElement({
            uri : requestedResourceURI
        });

        requestedResource.findMetadata(function(err, result){
            if(!err){

                var accept = req.header('Accept');
                var serializer = null;
                var contentType = null;
                if(accept == null || accept in Config.metadataSerializers == false)
                {
                    serializer = Config.defaultMetadataSerializer;
                    contentType = Config.defaultMetadataContentType;
                }
                else{
                    serializer = Config.metadataSerializers[accept];
                    contentType = Config.metadataContentTypes[accept];
                }

                res.set('Content-Type', contentType);
                res.send(serializer(result));

            }
            else{
                res.status(500).json({
                    error_messages : "Error finding metadata from " + requestedResource.uri + "\n" + result
                });
            }
        });
    }
};

exports.show_parent = function(req, res) {
    var acceptsHTML = req.accepts('html');
    var acceptsJSON = req.accepts('json');

    if(!acceptsJSON && acceptsHTML)
    {
        res.status(400).json({
            result: "error",
            message : "HTML Request not valid for this route."
        });
    }
    else
    {
        if(req.params.filepath != null)
        {
            var requestedResourceURI = req.params.requestedResource;

            InformationElement.findByUri(requestedResourceURI, function(err, ie){
                if(!err)
                {
                    if(ie != null)
                    {
                        ie.getParent(function(err, parent){
                            if(!err)
                            {
                                if(parent != null)
                                {
                                    parent.getPropertiesFromOntologies(
                                        Ontology.getPublicOntologiesUris(),
                                        function(err, descriptors)
                                        {
                                            if(!err)
                                            {
                                                //remove locked descriptors
                                                for(var i = 0 ; i < descriptors.length ; i++)
                                                {
                                                    if(descriptors[i].locked)
                                                    {
                                                        descriptors.splice(i, 1);
                                                    }
                                                }

                                                res.json({
                                                    result : "ok",
                                                    descriptors : descriptors
                                                });
                                            }
                                            else
                                            {
                                                res.status(500).json({
                                                    error_messages : [descriptors]
                                                });
                                            }
                                        });
                                }
                                else
                                {
                                    res.status(404).json({
                                        result : "error",
                                        message : "Unable to retrieve parent of " + requestedResourceURI + " ."
                                    });
                                }
                            }
                            else
                            {
                                res.status(500).json({
                                    result : "error",
                                    message : "Error retrieving resource " + requestedResourceURI + " . Error reported " + parent
                                });
                            }
                        });
                    }
                    else
                    {
                        res.status(404).json({
                            result : "error",
                            message : "Unable to retrieve resource " + requestedResourceURI + " ."
                        });
                    }
                }
                else
                {
                    res.status(500).json({
                        result : "error",
                        message : "Unable to get metadata for " + requestedResourceURI
                    });
                }
            });
        }
    }
};

exports.update = function(req, res) {
    var acceptsHTML = req.accepts('html');
    var acceptsJSON = req.accepts('json');

    if(!acceptsJSON && acceptsHTML)
    {
        res.status(400).json({
            result: "error",
            message : "HTML Request not valid for this route."
        })
    }
    else
    {
        const requestedResourceURI = req.params.requestedResource;

        InformationElement.findByUri(requestedResourceURI, function(err, resource)
        {
            if(!err)
            {
                if(resource != null)
                {
                    var descriptors = [];

                    if(req.body instanceof Array)
                    {
                        for(var i = 0; i < req.body.length; i++)
                        {
                            var rawDescriptor = req.body[i];

                            var descriptor = new Descriptor({
                                prefix : rawDescriptor.prefix,
                                shortName: rawDescriptor.shortName,
                                value : rawDescriptor.value,
                                uri : rawDescriptor.uri,
                                prefixedForm : rawDescriptor.prefixedForm
                            });

                            if(!(descriptor instanceof Descriptor) && descriptor.error != null)
                            {
                                res.status(400).json({
                                    result : "Error",
                                    message : descriptor.error
                                });

                                return;
                            }
                            else
                            {
                                //prevent changes on non-public/non-changeable descriptors
                                if(!descriptor.private && !descriptor.locked)
                                {
                                    descriptors.push(descriptor);
                                }
                            }
                        }

                        Descriptor.mergeDescriptors(descriptors, function(err, fusedDescriptors)
                        {
                            if(!err)
                            {
                                if(req.session.user != null)
                                {
                                    var changeAuthor = req.session.user.uri;
                                }
                                else
                                {
                                    var changeAuthor = null;
                                }

                                resource.replaceDescriptors(fusedDescriptors, [Config.types.locked, Config.types.private], []);

                                resource.save(function(err, record)
                                {
                                    if(!err)
                                    {
                                        record.reindex(req.index, function(err, result)
                                        {
                                            if(!err)
                                            {
                                                //Refresh metadata evaluation
                                                require(Config.absPathInSrcFolder("/controllers/evaluation.js")).shared.evaluate_metadata(req, function(err, evaluation)
                                                {
                                                    if (evaluation.metadata_evaluation != resource.ddr.metadataQuality)
                                                    {

                                                        resource.ddr.metadataQuality = evaluation.metadata_evaluation;
                                                        resource.save(function (err, result)
                                                        {
                                                            if (!err)
                                                            {
                                                                res.json({
                                                                    result: "OK",
                                                                    message: "Updated successfully.",
                                                                    new_metadata_quality_assessment: evaluation
                                                                });
                                                            }
                                                            else
                                                            {
                                                                res.status(500).json({
                                                                    result: "Error",
                                                                    message: "Unable to retrieve metadata recommendations for uri: " + requestedResourceURI + ". Error reported : " + error + " Response : " + JSON.stringify(response) + " Body : " + JSON.stringify(body)
                                                                });
                                                            }
                                                        });
                                                    }
                                                    else
                                                    {
                                                        res.json({
                                                            result: "OK",
                                                            message: "Updated successfully.",
                                                            new_metadata_quality_assessment: evaluation
                                                        });
                                                    }
                                                });
                                            }
                                            else
                                            {
                                                res.status(500).json({
                                                    result : "Error",
                                                    message : "Error updating resource : unable to reindex new values. Error reported : " + result
                                                });
                                            }
                                        });
                                    }
                                    else
                                    {
                                        res.status(500).json({
                                            result: "Error saving new record",
                                            message : record
                                        })
                                    }
                                }, true, changeAuthor, [Config.types.locked], null, [Config.types.audit]);
                            }
                            else
                            {
                                res.status(500).json({
                                    result: "Error merging descriptors",
                                    message : fusedDescriptors
                                })
                            }
                        });
                    }
                    else
                    {
                        var error = "Unable to update metadata for : " + req.params.requestedResource + ". JSON metadata must be sent in the body of the POST request and the Content-Type header should be set to 'application/json'";
                        console.error(error);
                        res.status(400).json({
                            result : "Error",
                            message : error
                        });
                    }
                }
                else
                {
                    var error = "Resource with uri : " + req.params.requestedResource + " is not present in the system. Error retrieved : " + resource;
                    res.status(404).json({
                        result : "Error",
                        message : error
                    });
                }
            }
            else
            {
                var error = "Unable to retrieve resource with uri : " + req.params.requestedResource + ". Error retrieved : " + resource;
                console.error(error);
                res.status(500).json({
                    result : "Error",
                    message : error
                });
            }
        });
    }
};

exports.show_version = function(req, res) {
    var acceptsHTML = req.accepts('html');
    var acceptsJSON = req.accepts('json');

    if(!acceptsJSON && acceptsHTML)
    {
        res.status(400).json({
            result: "error",
            message : "HTML Request not valid for this route."
        });
    }
    else
    {
        var requestedResourceURI = req.params.requestedResource;
        var requestedVersion = req.query.version;

        Resource.findByUri(requestedResourceURI, function(err, resource)
        {
            if(!err)
            {
                if(resource != null)
                {
                    ArchivedResource.findByResourceAndVersionNumber(requestedResourceURI, requestedVersion, function(err, version){
                        if(err)
                        {
                            var error = "Unable to retrieve Archived resource with uri : " + requestedResourceURI + ". Error retrieved : " + version;
                            console.error(error);
                            res.status(500).json({
                                result : "Error",
                                message : error
                            });
                        }
                        else
                        {
                            var descriptors = version.getDescriptors([Config.types.locked], [Config.types.api_readable]);
                            res.json({
                                descriptors : descriptors
                            });
                        }
                    });
                }
                else
                {
                    var error = "Unable to retrieve Archived resource with uri : " + requestedResourceURI;
                    console.error(error);
                    res.status(500).json({
                        result : "Error",
                        message : error
                    });
                }
            }
            else
            {
                var error = "Unable to retrieve resource with uri : " + req.params.requestedResource + ". Error retrieved : " + resource;
                console.error(error);
                res.status(500).json({
                    result : "Error",
                    message : error
                });
            }
        });
    }
};

exports.restore_metadata_version = function(req, res) {
    var acceptsHTML = req.accepts('html');
    var acceptsJSON = req.accepts('json');

    if(!acceptsJSON && acceptsHTML)
    {
        res.status(400).json({
            result: "error",
            message : "HTML Request not valid for this route."
        })
    }
    else
    {
        var requestedResourceURI = req.params.requestedResource;
        var requestedVersion = req.body.version;

        Resource.findByUri(requestedResourceURI, function(err, resource)
        {
            if(!err)
            {
                //if resource exists
                if(resource != null)
                {

                    ArchivedResource.findByResourceAndVersionNumber(requestedResourceURI, requestedVersion, function(err, version){
                        if(!err)
                        {
                            if(version != null)
                            {
                                var user = req.session.user;

                                if(user)
                                {
                                    var userUri = user.uri;
                                }
                                else
                                {
                                    var userUri = null;
                                }

                                resource.restoreFromArchivedVersion(version, function(err, result){
                                    if(!err)
                                    {
                                        res.status(200).json({
                                            result : "OK",
                                            message : "Resource " + requestedResourceURI + " succesfully restored to version " + requestedVersion
                                        });
                                    }
                                    else
                                    {
                                        var error = "Error restoring version  " + requestedVersion +"  of resource : " + requestedResourceURI + ". Error retrieved : " + JSON.stringify(result);
                                        console.error(error);
                                        res.status(500).json({
                                            result : "Error",
                                            message : error
                                        });
                                    }
                                }, userUri);
                            }
                            else
                            {
                                var error = "Version  " + requestedVersion +"  of resource : " + requestedResourceURI + " does not exist.";
                                console.error(error);
                                res.status(404).json({
                                    result : "Not Found",
                                    message : error
                                });
                            }
                        }
                        else
                        {
                            var error = "Unable to retrieve version  " + requestedVersion +"  of resource : " + requestedResourceURI + ". Error retrieved : " + JSON.stringify(resource);
                            console.error(error);
                            res.status(500).json({
                                result : "Error",
                                message : error
                            });
                        }
                    });
                }
                else
                {
                    var error = "Unable to retrieve version  " + requestedVersion +"  of resource : " + requestedResourceURI + ". Error retrieved : " + JSON.stringify(resource);
                    console.error(error);
                    res.status(500).json({
                        result : "Error",
                        message : error
                    });
                }
            }
            else
            {
                var error = "Unable to retrieve resource with uri : " + req.params.requestedResource + ". Error retrieved : " + resource;
                console.error(error);
                res.status(500).json({
                    result : "Error",
                    message : error
                });
            }
        });
    }
};



