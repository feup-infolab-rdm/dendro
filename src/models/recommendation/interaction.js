const path = require("path");
const rlequire = require("rlequire");
const Config = rlequire("dendro", "src/models/meta/config.js").Config;

const isNull = rlequire("dendro", "src/utils/null.js").isNull;
const Elements = rlequire("dendro", "src/models/meta/elements.js").Elements;
const Logger = rlequire("dendro", "src/utils/logger.js").Logger;
const Class = rlequire("dendro", "src/models/meta/class.js").Class;
const Resource = rlequire("dendro", "src/models/resource.js").Resource;

const moment = require("moment");
const async = require("async");
const db = Config.getDBByID();

const dbMySQL = rlequire("dendro", "src/mysql_models");

let Interaction = function (object = {})
{
    const self = this;
    self.addURIAndRDFType(object, "interaction", Interaction);
    Interaction.baseConstructor.call(this, object);
    self.copyOrInitDescriptors(object);
    return self;
};

Interaction.create = function (object, callback)
{
    let self = new Interaction(object);

    // if(!isNull(object.ddr.created))
    // {
    //     self.ddr.created = object.ddr.created;
    // }
    // else
    // {
    //     self.ddr.created = new Date();
    // }

    if (isNull(self.ddr.humanReadableURI))
    {
        self.getHumanReadableUri(function (err, uri)
        {
            self.ddr.humanReadableURI = uri;
            return callback(null, self);
        });
    }
    else
    {
        return callback(null, self);
    }
};

Interaction.all = function (callback, streaming, customGraphUri)
{
    const graphUri = (!isNull(customGraphUri) && typeof customGraphUri === "string") ? customGraphUri : db.graphUri;

    const getFullInteractions = function (interactions, callback)
    {
        const getInteractionInformation = function (interaction, callback)
        {
            Interaction.findByUri(interaction.uri, callback, null, customGraphUri);
        };

        // get all the information about all the interaction
        // and return the array of interactions, complete with that info
        async.mapSeries(interactions, getInteractionInformation, function (err, interactionsToReturn)
        {
            if (isNull(err))
            {
                return callback(null, interactionsToReturn);
            }
            return callback(err, "error fetching interaction information : " + err + "error reported: " + interactionsToReturn);
        });
    };

    if (isNull(streaming) || !streaming)
    {
        let query =
            "SELECT * " +
            "FROM [0] " +
            "WHERE " +
            "{ " +
            " ?uri rdf:type ddr:Interaction " +
            "} ";

        db.connection.executeViaJDBC(query,
            [
                {
                    type: Elements.types.resourceNoEscape,
                    value: graphUri
                }
            ],

            function (err, interactions)
            {
                if (isNull(err) && interactions instanceof Array)
                {
                    getFullInteractions(interactions, function (err, interactions)
                    {
                        if (isNull(err))
                        {
                            return callback(null, interactions);
                        }
                        return callback(err, interactions);
                    });
                }
                else
                {
                    // interactions var will contain an error message instead of an array of results.
                    return callback(err, interactions);
                }
            });
    }
    else
    {
        var query =
            "SELECT COUNT (?uri) as ?n_interactions " +
            "FROM [0] " +
            "WHERE " +
            "{ " +
            " ?uri rdf:type ddr:Interaction " +
            "} ";

        db.connection.executeViaJDBC(query,
            [
                {
                    type: Elements.types.resourceNoEscape,
                    value: graphUri
                }
            ],

            function (err, result)
            {
                if (isNull(err) && result instanceof Array && result.length === 1)
                {
                    const count = result[0].n_interactions;
                    const n_pages = Math.ceil(count / Config.streaming.db.page_size);
                    const pageNumbersArray = [];

                    for (let i = 0; i <= n_pages; i++)
                    {
                        pageNumbersArray.push(i);
                    }

                    async.mapLimit(pageNumbersArray, Config.recommendation.max_interaction_pushing_threads, function (pageNumber, cb)
                    {
                        Logger.log("Sending page " + pageNumber + " of " + n_pages);

                        const pageOffset = pageNumber * Config.streaming.db.page_size;

                        /**
                     * TODO Replace with this?
                     *
                     * DECLARE cr KEYSET CURSOR FOR
                     SELECT *
                     FROM
                     (
                     SPARQL SELECT * WHERE { ?s ?p ?o } LIMIT 10
                     ) x

                     * @type {string}
                     */
                        const query =
                            "SELECT ?uri\n" +
                            "WHERE \n" +
                            "{ \n" +
                            "{\n" +
                            "SELECT ?uri \n" +
                            "FROM [0] \n" +
                            "WHERE \n" +
                            "{ \n" +
                            " ?uri rdf:type ddr:Interaction \n" +
                            "} \n" +
                            " ORDER BY ?uri \n" +
                            "}\n" +
                            "} \n" +
                            " OFFSET [1] \n" +
                            " LIMIT [2] \n";

                        db.connection.executeViaJDBC(query,
                            [
                                {
                                    type: Elements.types.resourceNoEscape,
                                    value: graphUri
                                },
                                {
                                    type: Elements.types.int,
                                    value: pageOffset
                                },
                                {
                                    type: Elements.types.int,
                                    value: Config.streaming.db.page_size
                                }
                            ],
                            function (err, interactions)
                            {
                                if (isNull(err) && interactions instanceof Array)
                                {
                                    getFullInteractions(interactions, function (err, interactions)
                                    {
                                        return callback(err, interactions, cb);
                                    });
                                }
                                else
                                {
                                    // interactions var will contain an error message instead of an array of results.
                                    return callback(err, interactions);
                                }
                            });
                    },
                    function (err, results)
                    {
                        if (err)
                        {
                            return callback(err, "Error occurred fetching interactions in streamed mode : " + results);
                        }
                    });
                }
                else
                {
                    return callback(1, "Unable to fetch interaction count. Reported Error : " + result);
                }
            });
    }
};

Interaction.getRandomType = function (restrictions)
{
    let filteredTypes = {};
    if (restrictions instanceof Object)
    {
        for (let restriction in restrictions)
        {
            if (restrictions.hasOwnProperty(restriction))
            {
                for (let key in Interaction.types)
                {
                    if (Interaction.types.hasOwnProperty(key))
                    {
                        const type = Interaction.types[key];
                        if (!isNull(type[restriction]) && type[restriction] === true && restrictions[restriction])
                        {
                            filteredTypes[key] = Interaction.types[key];
                        }
                    }
                }
            }
        }
    }
    else
    {
        filteredTypes = Interaction.types;
    }

    const propertyIndex = Math.round((Object.keys(filteredTypes).length - 1) * Math.random());

    const interactionType = filteredTypes[Object.keys(filteredTypes)[propertyIndex]];

    return interactionType;
};

Interaction.prototype.saveToMySQL = function (callback/*, overwrite*/)
{
    const self = this;

    const insertNewInteraction = function (callback)
    {
        let insert = {
            performedBy: self.ddr.performedBy,
            interactionType: self.ddr.interactionType,
            executedOver: self.ddr.executedOver,
            originallyRecommendedFor: self.ddr.originallyRecommendedFor,
            rankingPosition: self.ddr.rankingPosition,
            pageNumber: (isNull(self.ddr.pageNumber) ? -1 : self.ddr.pageNumber),
            recommendationCallId: self.ddr.recommendationCallId,
            projectUri: self.ddr.projectUri
        };

        if (!isNull(self.ddr.recommendationCallTimeStamp) && typeof self.ddr.recommendationCallTimeStamp.slice(0, 19) !== "undefined")
        {
            insert.recommendationCallTimeStamp = moment(self.ddr.recommendationCallTimeStamp, moment.ISO_8601).format("YYYY-MM-DD HH:mm:ss");
        }
        else
        {
            insert.recommendationCallTimeStamp = null;
        }

        if (Config.debug.database.log_all_queries)
        {
            Logger.log("INSERT INTO interactions table");
        }

        dbMySQL.interactions
            .findOrCreate({where: {uri: self.uri}, defaults: insert})
            .spread((interaction, created) =>
            {
                if (!created)
                {
                    return callback(1, "Interaction with URI " + self.uri + " already recorded in MYSQL.");
                }
                return callback(null, interaction);
            }).catch(err =>
                callback(err, "Error inserting new interaction to MYSQL with URI " + self.uri));
    };

    insertNewInteraction(function (err, result)
    {
        return callback(err);
    });
};

Interaction.types =
{
    select_descriptor_from_manual_list: {
        key: "select_descriptor_from_manual_list",
        positive: true
    },
    accept_descriptor_from_quick_list: {
        key: "accept_descriptor_from_quick_list",
        positive: true
    },
    accept_descriptor_from_manual_list: {
        key: "accept_descriptor_from_manual_list",
        positive: true
    },
    accept_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite: {
        key: "accept_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite",
        positive: true
    },
    accept_descriptor_from_quick_list_while_it_was_a_user_favorite: {
        key: "accept_descriptor_from_quick_list_while_it_was_a_user_favorite",
        positive: true
    },
    accept_descriptor_from_quick_list_while_it_was_a_project_favorite: {
        key: "accept_descriptor_from_quick_list_while_it_was_a_project_favorite",
        positive: true
    },
    accept_descriptor_from_manual_list_while_it_was_a_project_favorite: {
        key: "accept_descriptor_from_manual_list_while_it_was_a_project_favorite",
        positive: true
    },
    accept_descriptor_from_manual_list_while_it_was_a_user_favorite: {
        key: "accept_descriptor_from_manual_list_while_it_was_a_user_favorite",
        positive: true
    },
    accept_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite: {
        key: "accept_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite",
        positive: true
    },
    accept_smart_descriptor_in_metadata_editor: {
        key: "accept_smart_descriptor_in_metadata_editor",
        positive: true
    },
    accept_favorite_descriptor_in_metadata_editor: {
        key: "accept_favorite_descriptor_in_metadata_editor",
        positive: true
    },
    accept_descriptor_from_autocomplete: {
        key: "accept_descriptor_from_autocomplete",
        positive: true
    },

    hide_descriptor_from_quick_list_for_project: {
        key: "hide_descriptor_from_quick_list_for_project",
        negative: true
    },

    unhide_descriptor_from_quick_list_for_project: {
        key: "unhide_descriptor_from_quick_list_for_project",
        negative: true
    },

    hide_descriptor_from_quick_list_for_user: {
        key: "hide_descriptor_from_quick_list_for_user",
        negative: true
    },

    unhide_descriptor_from_quick_list_for_user: {
        key: "unhide_descriptor_from_quick_list_for_user",
        negative: true
    },

    reject_descriptor_from_metadata_editor: {
        key: "reject_descriptor_from_metadata_editor",
        negative: true
    },

    favorite_descriptor_from_manual_list_for_user: {
        key: "favorite_descriptor_from_manual_list_for_user",
        positive: true
    },

    favorite_descriptor_from_quick_list_for_user: {
        key: "favorite_descriptor_from_quick_list_for_user",
        positive: true
    },

    unfavorite_descriptor_from_quick_list_for_user: {
        key: "unfavorite_descriptor_from_quick_list_for_user",
        positive: true
    },

    favorite_descriptor_from_manual_list_for_project: {
        key: "favorite_descriptor_from_manual_list_for_project",
        positive: true
    },

    favorite_descriptor_from_quick_list_for_project: {
        key: "favorite_descriptor_from_quick_list_for_project",
        positive: true
    },

    unfavorite_descriptor_from_quick_list_for_project: {
        key: "unfavorite_descriptor_from_quick_list_for_project",
        positive: true
    },

    reject_ontology_from_quick_list: {
        key: "reject_ontology_from_quick_list",
        negative: true
    },

    browse_to_next_page_in_descriptor_list: {
        key: "browse_to_next_page_in_descriptor_list"
    },

    browse_to_previous_page_in_descriptor_list: {
        key: "browse_to_previous_page_in_descriptor_list"
    },

    // manual mode

    select_ontology_manually: {
        key: "select_ontology_manually",
        positive: true
    },

    delete_descriptor_in_metadata_editor: {
        key: "delete_descriptor_in_metadata_editor",
        positive: true
    },

    fill_in_descriptor_from_manual_list_in_metadata_editor: {
        key: "fill_in_descriptor_from_manual_list_in_metadata_editor",
        positive: true
    },

    fill_in_descriptor_from_manual_list_while_it_was_a_user_favorite: {
        key: "fill_in_descriptor_from_manual_list_while_it_was_a_user_favorite",
        positive: true
    },

    fill_in_descriptor_from_manual_list_while_it_was_a_project_favorite: {
        key: "fill_in_descriptor_from_manual_list_while_it_was_a_project_favorite",
        positive: true
    },

    fill_in_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite: {
        key: "fill_in_descriptor_from_manual_list_while_it_was_a_user_and_project_favorite",
        positive: true
    },

    fill_in_descriptor_from_quick_list_in_metadata_editor: {
        key: "fill_in_descriptor_from_quick_list_in_metadata_editor",
        positive: true
    },

    fill_in_descriptor_from_quick_list_while_it_was_a_user_favorite: {
        key: "fill_in_descriptor_from_quick_list_while_it_was_a_user_favorite",
        positive: true
    },

    fill_in_descriptor_from_quick_list_while_it_was_a_project_favorite: {
        key: "fill_in_descriptor_from_quick_list_while_it_was_a_project_favorite",
        positive: true
    },

    fill_in_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite: {
        key: "fill_in_descriptor_from_quick_list_while_it_was_a_user_and_project_favorite",
        positive: true
    },

    fill_in_inherited_descriptor: {
        key: "fill_in_inherited_descriptor",
        label: "Fill in inherited descriptor"
    }
};

Interaction.prototype.getHumanReadableUri = function (callback)
{
    const self = this;
    const User = rlequire("dendro", "src/models/user.js").User;
    if (self.ddr.performedBy instanceof Object)
    {
        return callback(null, "/user/" + self.ddr.performedBy.ddr.username + "/interaction/" + self.ddr.created);
    }
    else if (typeof self.ddr.performedBy === "string")
    {
        User.findByUri(self.ddr.performedBy, function (err, user)
        {
            if (isNull(err) && !isNull(user))
            {
                return callback(null, "/user/" + user.ddr.username + "/interaction/" + self.ddr.created);
            }

            return callback(1, "Unable to get human readable uri for " + self.uri + " because the user in its ddr.performedBy (" + self.ddr.performedBy + ") property was not found");
        });
    }
    else
    {
        return callback(1, "Unable to get human readable uri for " + self.uri + " because it has no ddr.performedBy property.");
    }
};

Interaction = Class.extend(Interaction, Resource, "ddr:Interaction");

module.exports.Interaction = Interaction;
