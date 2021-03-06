const path = require("path");
const rlequire = require("rlequire");
const Config = rlequire("dendro", "src/models/meta/config.js").Config;

const isNull = rlequire("dendro", "src/utils/null.js").isNull;
const Descriptor = rlequire("dendro", "src/models/meta/descriptor.js").Descriptor;
const Elements = rlequire("dendro", "src/models/meta/elements.js").Elements;
const Logger = rlequire("dendro", "src/utils/logger.js").Logger;
const InformationElement = rlequire("dendro", "src/models/directory_structure/information_element.js").InformationElement;
const Ontology = rlequire("dendro", "src/models/meta/ontology.js").Ontology;
const Project = rlequire("dendro", "src/models/project.js").Project;
const Interaction = rlequire("dendro", "src/models/recommendation/interaction.js").Interaction;
const User = rlequire("dendro", "src/models/user.js").User;

const async = require("async");
const needle = require("needle");
const _ = require("underscore");

const addOntologyToListOfActiveOntologiesInSession = function (ontology, req)
{
    if (isNull(req.user.recommendations))
    {
        req.user.recommendations = {};
    }

    if (isNull(req.user.recommendations.ontologies))
    {
        req.user.recommendations.ontologies = {};
    }

    if (isNull(req.user.recommendations.ontologies.accepted))
    {
        req.user.recommendations.ontologies.accepted = {};
    }

    req.user.recommendations.ontologies.accepted[ontology.prefix] = ontology;

    return req;
};

// TODO resource has to be generic, and project has to be the project of the currently selected resource
const recordInteractionOverAResource = function (user, resource, req, res)
{
    if (!isNull(user) && !isNull(resource.uri))
    {
        if (!isNull(resource.recommendedFor) && typeof resource.recommendedFor === "string")
        {
            InformationElement.findByUri(resource.recommendedFor, function (err, ie)
            {
                if (!err)
                {
                    if (!isNull(ie))
                    {
                        ie.getOwnerProject(function (err, project)
                        {
                            if (isNull(err))
                            {
                                if (!isNull(project))
                                {
                                    project.getCreatorsAndContributors(function (err, contributors)
                                    {
                                        if (isNull(err) && !isNull(contributors) && contributors instanceof Array)
                                        {
                                            const createInteraction = function ()
                                            {
                                                Interaction.create({
                                                    ddr: {
                                                        performedBy: user.uri,
                                                        interactionType: req.body.interactionType,
                                                        executedOver: resource.uri,
                                                        originallyRecommendedFor: req.body.recommendedFor,
                                                        rankingPosition: req.body.rankingPosition,
                                                        pageNumber: req.body.pageNumber,
                                                        recommendationCallId: req.body.recommendationCallId,
                                                        recommendationCallTimeStamp: req.body.recommendationCallTimeStamp,
                                                        projectUri: project.uri
                                                    }
                                                }, function (err, interaction)
                                                {
                                                    interaction.save(
                                                        function (err, result)
                                                        {
                                                            if (isNull(err))
                                                            {
                                                                interaction.saveToMySQL(function (err, result)
                                                                {
                                                                    if (isNull(err))
                                                                    {
                                                                        const msg = "Interaction of type " + req.body.interactionType + " over resource " + resource.uri + " in the context of resource " + req.body.recommendedFor + " recorded successfully";
                                                                        Logger.log(msg);
                                                                        return res.json({
                                                                            result: "OK",
                                                                            message: msg
                                                                        });
                                                                    }
                                                                    const msg = "Error saving interaction of type " + req.body.interactionType + " over resource " + resource.uri + " in the context of resource " + req.body.recommendedFor + " to MYSQL. Error reported: " + result;
                                                                    Logger.log(msg);
                                                                    return res.status(500).json({
                                                                        result: "Error",
                                                                        message: msg
                                                                    });
                                                                });
                                                            }
                                                            else
                                                            {
                                                                const msg = "Error recording interaction over resource " + resource.uri + " in the context of resource " + req.body.recommendedFor + " : " + result;
                                                                Logger.log("error", msg);
                                                                return res.status(500).json({
                                                                    result: "Error",
                                                                    message: msg
                                                                });
                                                            }
                                                        });
                                                });
                                            };

                                            if (req.user.isAdmin)
                                            {
                                                createInteraction();
                                                return;
                                            }

                                            for (let i = 0; i < contributors.length; i++)
                                            {
                                                if (contributors[i].uri === user.uri)
                                                {
                                                    createInteraction();
                                                    return;
                                                }
                                            }

                                            const msg = "Unable to record interactions for resources of projects of which you are not a creator or contributor. User uri:  " + user.uri + ". Resource in question" + resource.uri + ". Owner project " + project.uri;
                                            Logger.log("error", msg);
                                            res.status(400).json({
                                                result: "Error",
                                                message: msg
                                            });
                                        }
                                        else
                                        {
                                            const msg = "Unable to retrieve creators and contributors of parent project " + project.uri + " of resource " + resource.uri;
                                            Logger.log("error", msg);
                                            res.status(500).json({
                                                result: "Error",
                                                message: msg
                                            });
                                        }
                                    });
                                }
                            }
                            else
                            {
                                const msg = "Unable to retrieve parent project of resource " + resource.uri;
                                Logger.log("error", msg);
                                res.status(404).json({
                                    result: "Error",
                                    message: msg
                                });
                            }
                        });
                    }
                    else
                    {
                        const msg = "Resource with uri " + resource.recommendedFor + " not found in this system.";
                        Logger.log("error", JSON.stringify(resource));
                        Logger.log("error", msg);
                        res.status(404).json({
                            result: "Error",
                            message: msg
                        });
                    }
                }
                else
                {
                    const msg = "Error retriving resource " + resource.recommendedFor;
                    Logger.log("error", JSON.stringify(resource));
                    Logger.log("error", msg);
                    res.status(500).json({
                        result: "Error",
                        message: msg
                    });
                }
            });
        }
        else
        {
            const msg = "Request Body JSON is invalid since it has no 'recommendedFor' field, which should contain the current URL when the interaction took place. Either that, or the field is not a string as it should be.";
            Logger.log("error", JSON.stringify(resource));
            Logger.log("error", msg);
            res.status(400).json({
                result: "Error",
                message: msg
            });
        }
    }
    else
    {
        const msg = "Error recording interaction over resource " + resource.uri + " : No user is currently authenticated!";
        Logger.log("error", msg);
        res.status(500).json({
            result: "Error",
            message: msg
        });
    }
};

exports.accept_descriptor_from_quick_list = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.accept_descriptor_from_quick_list.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.accept_descriptor_from_quick_list.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.accept_descriptor_from_quick_list.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.accept_descriptor_from_manual_list = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.accept_descriptor_from_manual_list.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.accept_descriptor_from_manual_list.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.accept_descriptor_from_manual_list.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.accept_descriptor_from_manual_list_while_it_was_a_project_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually while it was a project favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually while it was a project favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.accept_descriptor_from_manual_list_while_it_was_a_project_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.accept_descriptor_from_manual_list_while_it_was_a_project_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.accept_descriptor_from_manual_list_while_it_was_a_project_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.accept_descriptor_from_manual_list_while_it_was_a_user_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually while it was a user favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually while it was a user favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.accept_descriptor_from_manual_list_while_it_was_a_user_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.accept_descriptor_from_manual_list_while_it_was_a_user_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.accept_descriptor_from_manual_list_while_it_was_a_user_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.accept_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually while it was a user and project favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually while it was a user and project favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.accept_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.accept_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.accept_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.accept_descriptor_from_quick_list_while_it_was_a_project_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting descriptor from quick list while ie was a project favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting descriptor from quick list while ie was a project favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.accept_descriptor_from_quick_list_while_it_was_a_project_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.accept_descriptor_from_quick_list_while_it_was_a_project_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.accept_descriptor_from_quick_list_while_it_was_a_project_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.accept_descriptor_from_quick_list_while_it_was_a_user_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting descriptor from quick list while ie was a user favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting descriptor from quick list while ie was a user favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.accept_descriptor_from_quick_list_while_it_was_a_user_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.accept_descriptor_from_quick_list_while_it_was_a_user_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.accept_descriptor_from_quick_list_while_it_was_a_user_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.accept_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting descriptor from quick list while ie was a user and project favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting descriptor from quick list while ie was a user and project favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.accept_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.accept_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.accept_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.hide_descriptor_from_quick_list_for_project = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when hiding descriptor. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when hiding descriptor. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.hide_descriptor_from_quick_list_for_project.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.hide_descriptor_from_quick_list_for_project.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.hide_descriptor_from_quick_list_for_project.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.unhide_descriptor_from_quick_list_for_project = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when unhiding descriptor. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when unhiding descriptor. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.unhide_descriptor_from_quick_list_for_project.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.unhide_descriptor_from_quick_list_for_project.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.unhide_descriptor_from_quick_list_for_project.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.hide_descriptor_from_quick_list_for_user = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when hiding descriptor. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when hiding descriptor. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.hide_descriptor_from_quick_list_for_user.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.hide_descriptor_from_quick_list_for_user.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.hide_descriptor_from_quick_list_for_user.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.unhide_descriptor_from_quick_list_for_user = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when unhiding descriptor. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when unhiding descriptor. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.unhide_descriptor_from_quick_list_for_user.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.unhide_descriptor_from_quick_list_for_user.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.unhide_descriptor_from_quick_list_for_user.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.favorite_descriptor_from_manual_list_for_project = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when favoriting a descriptor from the manual list. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when favoriting a descriptor from the manual list. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.favorite_descriptor_from_manual_list_for_project.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.favorite_descriptor_from_manual_list_for_project.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.favorite_descriptor_from_manual_list_for_project.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.favorite_descriptor_from_quick_list_for_project = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when favoriting a descriptor from the quick list. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when favoriting a descriptor from the quick list. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.favorite_descriptor_from_quick_list_for_project.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.favorite_descriptor_from_quick_list_for_project.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.favorite_descriptor_from_quick_list_for_project.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.favorite_descriptor_from_manual_list_for_user = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when favoriting a descriptor from the manual list. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when favoriting a descriptor from the manual list. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.favorite_descriptor_from_manual_list_for_user.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.favorite_descriptor_from_manual_list_for_user.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.favorite_descriptor_from_manual_list_for_user.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.favorite_descriptor_from_quick_list_for_user = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when favoriting a descriptor from the quick list. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when favoriting a descriptor from the quick list. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.favorite_descriptor_from_quick_list_for_user.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.favorite_descriptor_from_quick_list_for_user.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.favorite_descriptor_from_quick_list_for_user.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.unfavorite_descriptor_from_quick_list_for_project = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when unfavoriting a descriptor from the quick list. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when unfavoriting a descriptor from the quick list. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.unfavorite_descriptor_from_quick_list_for_project.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.unfavorite_descriptor_from_quick_list_for_project.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.unfavorite_descriptor_from_quick_list_for_project.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.unfavorite_descriptor_from_quick_list_for_user = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when unfavoriting a descriptor from the quick list. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when unfavoriting a descriptor from the quick list. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.unfavorite_descriptor_from_quick_list_for_user.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.unfavorite_descriptor_from_quick_list_for_user.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.unfavorite_descriptor_from_quick_list_for_user.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.accept_descriptor_from_autocomplete = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting a descriptor from the autocomplete feature. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting a descriptor from the autocomplete feature. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.accept_descriptor_from_autocomplete.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.accept_descriptor_from_autocomplete.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.accept_smart_descriptor_in_metadata_editor = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting descriptor in metadata editor area. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting descriptor in metadata editor area. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.accept_smart_descriptor_in_metadata_editor.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.accept_smart_descriptor_in_metadata_editor.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.accept_smart_descriptor_in_metadata_editor.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                // req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.accept_favorite_descriptor_in_metadata_editor = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting favorite descriptor in metadata editor area. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting favorite descriptor in metadata editor area. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.accept_favorite_descriptor_in_metadata_editor.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.accept_favorite_descriptor_in_metadata_editor.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.accept_favorite_descriptor_in_metadata_editor.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                // req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.delete_descriptor_in_metadata_editor = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when deleting descriptor in metadata editor area. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when deleting descriptor in metadata editor area. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.delete_descriptor_in_metadata_editor.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.delete_descriptor_in_metadata_editor.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                // req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.fill_in_descriptor_from_manual_list_in_metadata_editor = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from manual list in metadata editor area. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from manual list in metadata editor area. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.fill_in_descriptor_from_manual_list_in_metadata_editor.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.fill_in_descriptor_from_manual_list_in_metadata_editor.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.fill_in_descriptor_from_manual_list_in_metadata_editor.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                // req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.fill_in_descriptor_from_manual_list_while_it_was_a_project_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from manual list while it was a project favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from manual list while it was a project favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.fill_in_descriptor_from_manual_list_while_it_was_a_project_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.fill_in_descriptor_from_manual_list_while_it_was_a_project_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.fill_in_descriptor_from_manual_list_while_it_was_a_project_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.fill_in_descriptor_from_manual_list_while_it_was_a_user_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from manual list while it was a user favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from manual list while it was a user favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.fill_in_descriptor_from_manual_list_while_it_was_a_user_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.fill_in_descriptor_from_manual_list_while_it_was_a_user_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.fill_in_descriptor_from_manual_list_while_it_was_a_user_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.fill_in_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from manual list while it was a user and project favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from manual list while it was a user and project favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.fill_in_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.fill_in_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.fill_in_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.fill_in_descriptor_from_quick_list_in_metadata_editor = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from quick list metadata editor area. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from quick list metadata editor area. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.fill_in_descriptor_from_quick_list_in_metadata_editor.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.fill_in_descriptor_from_quick_list_in_metadata_editor.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.fill_in_descriptor_from_quick_list_in_metadata_editor.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                // req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.fill_in_descriptor_from_quick_list_while_it_was_a_project_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from quick list while it was a project favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from quick list while it was a project favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.fill_in_descriptor_from_quick_list_while_it_was_a_project_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.fill_in_descriptor_from_quick_list_while_it_was_a_project_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.fill_in_descriptor_from_quick_list_while_it_was_a_project_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.fill_in_descriptor_from_quick_list_while_it_was_a_user_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from quick list while it was a user favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from quick list while it was a user favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.fill_in_descriptor_from_quick_list_while_it_was_a_user_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.fill_in_descriptor_from_quick_list_while_it_was_a_user_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.fill_in_descriptor_from_quick_list_while_it_was_a_user_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.fill_in_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from quick list while it was a user and project favorite. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when filling in descriptor from quick list while it was a user and project favorite. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.fill_in_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.fill_in_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.fill_in_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            const descriptor = new Descriptor({
                uri: req.body.uri
            });

            if (descriptor instanceof Descriptor)
            {
                const ontology = new Ontology({
                    uri: descriptor.ontology
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
            else
            {
                res.status(500).json({
                    result: "Error",
                    message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                });
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.select_ontology_manually = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when accepting ontology manually. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.select_ontology_manually.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.select_ontology_manually.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // ontology uri
                if (!isNull(req.body.uri))
                {
                    Ontology.findByUri(req.body.uri, function (err, ontology)
                    {
                        if (isNull(err))
                        {
                            if (isNull(ontology))
                            {
                                let errorObj = {
                                    statusCode: 500,
                                    message: "Interaction type " + Interaction.types.select_ontology_manually.key + " requires a valid ontology 'uri' in the request's body. It represents the ontology to be selected."
                                };
                                callback(errorObj);
                            }
                            else
                            {
                                callback(null);
                            }
                        }
                        else
                        {
                            let errorObj = {
                                statusCode: 500,
                                message: "Interaction type " + Interaction.types.select_ontology_manually.key + " requires a valid ontology 'uri' in the request's body. It represents the ontology to be selected."
                            };
                            callback(errorObj);
                        }
                    });
                    // callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.select_ontology_manually.key + " requires field uri in the request's body. It represents the ontology to be selected."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            if (!isNull(req.user))
            {
                const ontology = new Ontology({
                    uri: req.body.uri
                });

                req = addOntologyToListOfActiveOntologiesInSession(ontology, req);

                recordInteractionOverAResource(req.user, req.body, req, res);
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.select_descriptor_manually = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when selecting a descriptor manually. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when selecting a descriptor manually. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.select_descriptor_from_manual_list.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.select_descriptor_from_manual_list.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.pageNumber) && Number.isInteger(req.body.pageNumber))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid page number in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.recommendationCallId))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Interaction type " + Interaction.types.select_descriptor_from_manual_list.key + " requires field recommendationCallId in the request's body."
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                // recommendationCallTimeStamp
                if (!isNull(req.body.recommendationCallTimeStamp) && !isNaN(Date.parse(req.body.recommendationCallTimeStamp)))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid recommendationCallTimeStamp in the request's body. It should be an valid date."
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            if (!isNull(req.user))
            {
                const descriptor = new Descriptor({
                    uri: req.body.uri
                });

                if (descriptor instanceof Descriptor)
                {
                    recordInteractionOverAResource(req.user, req.body, req, res);
                }
                else
                {
                    res.status(500).json({
                        result: "Error",
                        message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                    });
                }
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.reject_ontology_from_quick_list = function (req, res)
{
    if (req.body instanceof Object)
    {
        if (req.body.interactionType === Interaction.types.reject_ontology_from_quick_list.key)
        {
            if (!isNull(req.user))
            {
                const ontology = new Ontology({
                    uri: req.body.uri
                });

                if (!isNull(req.user.recommendations.ontologies.accepted))
                {
                    delete req.user.recommendations.ontologies.accepted[ontology.prefix];

                    recordInteractionOverAResource(req.user, req.body, req, res);

                    res.json({
                        result: "OK",
                        message: "Ontology " + ontology.uri + " removed successfully"
                    });
                }
            }
        }
        else
        {
            res.status(500).json({
                result: "Error",
                message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.reject_ontology_from_quick_list.key
            });
        }
    }
    else
    {
        res.status(500).json({
            result: "Error",
            message: "Invalid request. Body contents is not a valid JSON"
        });
    }
};

exports.fill_in_inherited_descriptor = function (req, res)
{
    const validateBodyObject = function (req, callback)
    {
        async.waterfall([
            function (callback)
            {
                if (req.body instanceof Object)
                {
                    try
                    {
                        JSON.parse(JSON.stringify(req.body));
                        callback(null);
                    }
                    catch (error)
                    {
                        let errorObj = {
                            statusCode: 500,
                            message: "Invalid request. Body contents is not a valid JSON when selecting a descriptor manually. Request body is : " + JSON.stringify(req.body)
                        };
                        callback(errorObj);
                    }
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid request. Body contents is not a valid JSON when selecting a descriptor manually. Request body is : " + JSON.stringify(req.body)
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (req.body.interactionType === Interaction.types.fill_in_inherited_descriptor.key)
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid interaction type in the request's body. It should be : " + Interaction.types.fill_in_inherited_descriptor.key
                    };
                    callback(errorObj);
                }
            },
            function (callback)
            {
                if (!isNull(req.body.rankingPosition) && Number.isInteger(req.body.rankingPosition))
                {
                    callback(null);
                }
                else
                {
                    let errorObj = {
                        statusCode: 500,
                        message: "Invalid ranking position in the request's body. It should be an integer"
                    };
                    callback(errorObj);
                }
            }],
        function (err, results)
        {
            if (isNull(err))
            {
                callback(null, null);
            }
            else
            {
                callback(true, err);
            }
        }
        );
    };

    validateBodyObject(req, function (err, result)
    {
        if (isNull(err))
        {
            if (!isNull(req.user))
            {
                const descriptor = new Descriptor({
                    uri: req.body.uri
                });

                if (descriptor instanceof Descriptor)
                {
                    recordInteractionOverAResource(req.user, req.body, req, res);
                }
                else
                {
                    res.status(500).json({
                        result: "Error",
                        message: "Requested Descriptor " + descriptor.uri + " is unknown / not parametrized in this Dendro instance."
                    });
                }
            }
        }
        else
        {
            res.status(result.statusCode).json({
                result: "Error",
                message: result.message
            });
        }
    });
};

exports.delete_all_interactions = function (req, res)
{
    // Interaction.deleteAllOfMyTypeAndTheirOutgoingTriples(function (err, result)
    Interaction.deleteAll(function (err, result)
    {
        if (isNull(err))
        {
            res.json({
                result: "OK",
                message: "All interactions successfully deleted."
            });
        }
        else
        {
            res.status(500).json({
                result: "Error",
                message: "There was an error deleting all the interactions recorded by the system : " + result
            });
        }
    });
};
