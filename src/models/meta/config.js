const rlequire = require("rlequire");

/**
 * Configuration parameters
 */

function Config ()
{}

const fs = require("fs");
const path = require("path");
const _ = require("underscore");
const isNull = require("../../utils/null.js").isNull;

const Elements = require("./elements.js").Elements;
const Logger = rlequire("dendro", "src/utils/logger.js").Logger;

const activeConfigFilePath = rlequire.absPathInApp("dendro", "conf/active_deployment_config.json");
const configs = rlequire("dendro", "conf/deployment_configs.json");

let activeConfigKey;

const argv = require("yargs").argv;

if (argv.config)
{
    Logger.log("info", "Deployment configuration overriden by --conf argument. Configuration is " + argv.config);
    activeConfigKey = argv.config;
}
else
{
    if (argv.config)
    {
        activeConfigKey = argv.config;
    }
    else if (process.env.NODE_ENV === "test")
    {
        activeConfigKey = "test";
        Logger.log("Running in test environment detected");
    }
    else
    {
        activeConfigKey = JSON.parse(fs.readFileSync(activeConfigFilePath, "utf8")).key;
        Logger.log("Running with deployment config " + activeConfigKey);
    }
}

const activeConfig = configs[activeConfigKey];

if (isNull(activeConfig))
{
    const noConfigPresentError = "There is no configuration with key " + activeConfigKey + " in " + activeConfigFilePath + " ! The key is invalid or the file needs to be reconfigured.";
    Logger.log("error", noConfigPresentError);
    throw new Error(noConfigPresentError);
}

const getConfigParameter = function (parameter, defaultValue)
{
    if (isNull(activeConfig[parameter]))
    {
        if (!isNull(defaultValue))
        {
            Logger.log("error", "[WARNING] Using default value " + JSON.stringify(defaultValue) + " for parameter " + parameter + " !");
            Config[parameter] = defaultValue;
            return Config[parameter];
        }

        throw new Error("[FATAL ERROR] Unable to retrieve parameter " + parameter + " from '" + activeConfigKey + "' configuration. Please review the deployment_configs.json file.");
    }
    else
    {
        return activeConfig[parameter];
    }
};

Config.activeConfiguration = activeConfigKey;

// hostname for the machine in which this is running, configure when running on a production machine
Config.port = getConfigParameter("port");
Config.host = getConfigParameter("host");
Config.baseUri = getConfigParameter("baseUri");
Config.environment = getConfigParameter("environment");

if (Config.environment !== "test" &&
    Config.environment !== "development" &&
    Config.environment !== "production"
)
{
    throw new Error("Invalid environment configuration set! : " + Config.environment);
}
else
{
    process.env.NODE_ENV = Config.environment;
}

Config.eudatBaseUrl = getConfigParameter("eudatBaseUrl");
Config.eudatToken = getConfigParameter("eudatToken");
Config.eudatCommunityId = getConfigParameter("eudatCommunityId");
Config.sendGridUser = getConfigParameter("sendGridUser");
Config.sendGridPassword = getConfigParameter("sendGridPassword");

Config.elasticSearchHost = getConfigParameter("elasticSearchHost");
Config.elasticSearchPort = getConfigParameter("elasticSearchPort");

Config.cache = getConfigParameter("cache");
Config.datastore = getConfigParameter("datastore");
Config.ontologies_cache = getConfigParameter("ontologies_cache");

Config.virtuosoHost = getConfigParameter("virtuosoHost");
Config.virtuosoPort = getConfigParameter("virtuosoPort");
Config.virtuosoISQLPort = getConfigParameter("virtuosoISQLPort");
Config.virtuosoSQLLogLevel = getConfigParameter("virtuosoSQLLogLevel");

Config.fusekiHost = getConfigParameter("fusekiHost");
Config.fusekiPort = getConfigParameter("fusekiPort");
Config.fusekiAuth = getConfigParameter("fusekiAuth");
Config.fusekiDataset = getConfigParameter("fusekiDataset");
Config.fusekiDbType = getConfigParameter("fusekiDbType");

Config.graphDatabase = (function ()
{
    const connectorType = getConfigParameter("graphDatabase");

    if (connectorType === "virtuoso" || connectorType === "fuseki")
    {
        return connectorType;
    }
    throw new Error("Invalid graphDatabase type " + connectorType + " valid options: \"virtuoso\" or \"fuseki\"");
}());

Config.skipDescriptorValuesValidation = getConfigParameter("skipDescriptorValuesValidation", false);

Config.virtuosoConnector = (function ()
{
    const connectorType = getConfigParameter("virtuosoConnector");

    if (connectorType === "jdbc" || connectorType === "http")
    {
        return connectorType;
    }
    throw new Error("Invalid Virtuoso Server connector type " + connectorType);
}());

Config.virtuosoAuth = getConfigParameter("virtuosoAuth");

// maps
Config.maps = getConfigParameter("maps");

// change log config
Config.change_log = parseInt(getConfigParameter("change_log"));

// mongodb cluster used for file storage
Config.mongoDBHost = getConfigParameter("mongoDBHost");
Config.mongoDbPort = getConfigParameter("mongoDbPort");
Config.mongoDbCollectionName = getConfigParameter("mongoDbCollectionName");
Config.mongoDBSessionStoreCollection = getConfigParameter("mongoDBSessionStoreCollection");
Config.mongoDbVersion = getConfigParameter("mongoDbVersion");
Config.mongoDBAuth = getConfigParameter("mongoDBAuth");
// storage default config
Config.defaultStorageConfig = getConfigParameter("storageDefaults");
Config.defaultStorageConfig.port = parseInt(Config.defaultStorageConfig.port);

// mysql database for interaction

Config.mySQLHost = getConfigParameter("mySQLHost");
Config.mySQLPort = getConfigParameter("mySQLPort");
Config.mySQLAuth = getConfigParameter("mySQLAuth");
Config.mySQLDBName = getConfigParameter("mySQLDBName");

// file uploads and downloads

// 1000MB®
Config.maxUploadSize = getConfigParameter("maxUploadSize");
// 10000MB®
Config.maxProjectSize = getConfigParameter("maxProjectSize");
Config.maxSimultaneousConnectionsToDb = getConfigParameter("maxSimultaneousConnectionsToDb");

Config.dbOperationTimeout = getConfigParameter("dbOperationTimeout");

if (path.isAbsolute(getConfigParameter("tempFilesDir")))
{
    Config.tempFilesDir = getConfigParameter("tempFilesDir");
}
else
{
    Config.tempFilesDir = rlequire.absPathInApp("dendro", getConfigParameter("tempFilesDir"));
}

if (path.isAbsolute(getConfigParameter("tempUploadsDir")))
{
    Config.tempUploadsDir = getConfigParameter("tempUploadsDir");
}
else
{
    Config.tempUploadsDir = rlequire.absPathInApp("dendro", getConfigParameter("tempUploadsDir"));
}

Config.tempFilesCreationMode = getConfigParameter("tempFilesCreationMode");

Config.administrators = getConfigParameter("administrators");

// load debug and startup settings
Config.debug = getConfigParameter("debug");
Config.startup = getConfigParameter("startup");

if (argv.seed_databases)
{
    Logger.log("info", "Seeding databases parameter overriden by --seed-databases argument. Will load databases and exit.");
    Config.startup.load_databases = true;
    Config.startup.reload_administrators_on_startup = true;
    Config.startup.reload_demo_users_on_startup = true;
    Config.startup.reload_ontologies_on_startup = true;
    Config.startup.clear_session_store = true;
    Config.startup.destroy_all_graphs = true;
    Config.startup.destroy_all_indexes = true;
    Config.startup.destroy_datastore = true;
    Config.startup.destroy_files_store = true;
}

Config.baselines = getConfigParameter("baselines");

// load logger options
Config.logging = getConfigParameter("logging");

// load version description
Config.version = {
    name: rlequire("dendro", "package.json").name,
    number: rlequire("dendro", "package.json").version
};

// secrets
Config.crypto = getConfigParameter("crypto");

// load recommendation settings
Config.recommendation = getConfigParameter("recommendation");
Config.recommendation.getTargetTable = function ()
{
    let tableName = null;
    if (Config.recommendation.modes.dendro_recommender.log_modes.phase_1.active)
    {
        tableName = Config.recommendation.modes.dendro_recommender.log_modes.phase_1.table_to_write_interactions;
    }
    else if (Config.recommendation.modes.dendro_recommender.log_modes.phase_2.active)
    {
        tableName = Config.recommendation.modes.dendro_recommender.log_modes.phase_2.table_to_write_interactions;
    }
    else
    {
        if (!isNull(Config.recommendations.interactions_recording_table))
        {
            tableName = Config.recommendations.interactions_recording_table;
        }
    }

    if (isNull(tableName))
    {
        throw new Error("Unspecified interactions table name. Check your deployment_configs.json for recommendation/interactions_recording_table field.");
    }
    else
    {
        return tableName;
    }
};

Config.exporting = getConfigParameter("exporting");

Config.cache = getConfigParameter("cache");

/**
 * Database connection (s).
 * @type {{default: {baseURI: string, graphName: string, graphUri: string}}}
 */

Config.getDBByHandle = function (dbHandle)
{
    if (!isNull(dbHandle))
    {
        const key = _.find(Object.keys(Config.db), function (key)
        {
            return Config.db[key].graphHandle === dbHandle;
        });

        if (!isNull(key))
        {
            return Config.db[key];
        }

        return null;
    }

    return Config.db.default;
};

/**
 * Database connection (s).
 * @type {{default: {baseURI: string, graphName: string, graphUri: string}}}
 */

Config.getDBByID = function (DBID)
{
    if (!isNull(DBID))
    {
        if (!isNull(Config.db[DBID]))
        {
            return Config.db[DBID];
        }
        throw new Error("Invalid DB connection ID " + DBID);
    }
    else
    {
        return Config.db.default;
    }
};

Config.getDBByGraphUri = function (graphUri)
{
    if (!isNull(graphUri))
    {
        if (!isNull(Config.db_by_uri[graphUri]))
        {
            return Config.db_by_uri[graphUri];
        }
        for (let dbKey in Config.db)
        {
            if (Config.db.hasOwnProperty(dbKey))
            {
                if (!isNull(Config.db[dbKey]))
                {
                    if (Config.db[dbKey].graphUri === graphUri)
                    {
                        Config.db_by_uri[graphUri] = Config.db[dbKey];
                        return Config.db_by_uri[graphUri];
                    }
                }
            }
        }
    }

    return Config.db.default;
};

Config.getGFSByID = function (gfsID)
{
    if (!isNull(gfsID))
    {
        if (!isNull(Config.gfs[gfsID]))
        {
            return Config.gfs[gfsID];
        }
        throw new Error("Invalid GridFS connection ID " + gfsID);
    }
    else
    {
        return Config.gfs.default;
    }
};

Config.getMySQLByID = function (mySQLID)
{
    if (!isNull(mySQLID))
    {
        if (!isNull(Config.mysql[mySQLID]))
        {
            return Config.mysql[mySQLID];
        }
        throw new Error("Invalid MySQL connection ID " + mySQLID);
    }
    else
    {
        return Config.mysql.default;
    }
};

Config.db_by_uri = {};
Config.mysql_by_id = {};
Config.gfs_by_id = {};

Config.db = {
    default: {
        baseURI: "http://" + Config.host,
        graphHandle: "dendro_graph",
        graphUri: "http://" + Config.host + "/dendro_graph",
        cache: {
            id: "default",
            type: "mongodb"
        }
    },
    social: {
        baseURI: "http://" + Config.host,
        graphHandle: "social_dendro",
        graphUri: "http://" + Config.host + "/social_dendro",
        cache: {
            id: "social",
            type: "mongodb"
        }
    },
    notifications: {
        baseURI: "http://" + Config.host,
        graphHandle: "notifications_dendro",
        graphUri: "http://" + Config.host + "/notifications_dendro",
        cache: {
            id: "notifications",
            type: "mongodb"
        }
    }
};

Config.gfs = {
    default: {}
};

Config.mysql = {
    default: {}
};

Config.enabledOntologies = {
    dcterms: {
        prefix: "dcterms",
        uri: "http://purl.org/dc/terms/",
        elements: Elements.ontologies.dcterms,
        label: "Dublin Core terms",
        description: "Generic description. Creator, title, subject...",
        downloadURL: "http://dublincore.org/2012/06/14/dcelements.rdf",
        domain: "Generic",
        domain_specific: false
    },
    foaf: {
        prefix: "foaf",
        uri: "http://xmlns.com/foaf/0.1/",
        elements: Elements.ontologies.foaf,
        label: "Friend of a friend",
        description: "For expressing people-related metadata. Mailbox, web page...",
        downloadURL: "http://xmlns.com/foaf/spec/20140114.rdf",
        domain: "Generic",
        domain_specific: false
    },
    ddr: {
        prefix: "ddr",
        uri: "http://dendro.fe.up.pt/ontology/0.1/",
        private: true,
        elements: Elements.ontologies.ddr,
        label: "Dendro internal ontology",
        description: "Designed to represent internal system information important to Dendro",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/DENDRO/dendro.owl",
        domain: "Generic",
        domain_specific: false
    },
    rdf: {
        prefix: "rdf",
        uri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        private: true,
        elements: Elements.ontologies.rdf,
        label: "Resource Description Framework",
        description: "Low-level technical ontology. It is the building block of all others.",
        downloadURL: "https://www.w3.org/1999/02/22-rdf-syntax-ns.rdf",
        domain: "Low-level, System",
        domain_specific: false
    },
    nie: {
        prefix: "nie",
        uri: "http://www.semanticdesktop.org/ontologies/2007/01/19/nie#",
        private: true,
        elements: Elements.ontologies.nie,
        label: "Nepomuk Information Element",
        description: "Ontology for representing files and folders. Information Elements",
        downloadURL: "http://lov.okfn.org/dataset/lov/vocabs/nie/versions/2012-10-03.n3",
        domain: "Low-level, System",
        domain_specific: false
    },
    nfo: {
        prefix: "nfo",
        uri: "http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#",
        private: true,
        elements: Elements.ontologies.nfo,
        label: "Nepomuk File Ontology",
        description: "Ontology for representing files and folders. Files and Folders.",
        domain: "Low-level, System",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/ACHEM/achem.owl",
        domain_specific: false
    },
    research: {
        prefix: "research",
        uri: "http://dendro.fe.up.pt/ontology/research/",
        elements: Elements.ontologies.research,
        label: "Dendro research",
        description: "Experimental research-related metadata. Instrumentation, method...",
        domain: "Generic",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/RESEARCH/research.owl",
        domain_specific: true
    },
    dcb: {
        prefix: "dcb",
        uri: "http://dendro.fe.up.pt/ontology/dcb/",
        elements: Elements.ontologies.dcb,
        label: "Double Cantilever Beam",
        description: "Fracture mechanics experiments. Initial crack length, Material type...",
        domain: "Mechanical Engineering",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/DCB/dcb.owl",
        domain_specific: true
    },
    achem: {
        prefix: "achem",
        uri: "http://dendro.fe.up.pt/ontology/achem/",
        elements: Elements.ontologies.achem,
        label: "Pollutant analysis",
        description: "Analytical Chemistry experimental studies... Analysed substances, Sample count...",
        domain: "Analytical Chemistry",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/ACHEM/achem.owl",
        domain_specific: true
    },
    bdv: {
        prefix: "bdv",
        uri: "http://dendro.fe.up.pt/ontology/BIODIV/0.1#",
        elements: Elements.ontologies.bdv,
        label: "Biodiversity evolution studies",
        description: "For INSPIRE-represented observational data for biodiversity. Reference system identifier, Metadata point of contact...",
        domain: "Biodiversity, Georeferencing",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/BIODIV/BIODIV_17Jun_1557.owl",
        domain_specific: true
    },
    biocn: {
        prefix: "biocn",
        uri: "http://dendro.fe.up.pt/ontology/BioOc#",
        elements: Elements.ontologies.biocn,
        label: "Biological Oceanography",
        description: "Biological Oceanography observational and experimental studies...Life stage, Species count, individualPerSpecie...",
        domain: "Biological Oceanography",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/BIOOC/BioOc.owl",
        domain_specific: true
    },
    grav: {
        prefix: "grav",
        uri: "http://dendro.fe.up.pt/ontology/gravimetry#",
        elements: Elements.ontologies.grav,
        label: "Gravimetry",
        description: "Gravimetry observational and experimental studies...Altitude resolution; Beginning time...",
        domain: "Gravimetry",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/GRAVIMETRY/gravimetry.owl",
        domain_specific: true
    },
    hdg: {
        prefix: "hdg",
        uri: "http://dendro.fe.up.pt/ontology/hydrogen#",
        elements: Elements.ontologies.hdg,
        label: "Hydrogen Generation",
        description: "Hydrogen Generation experimental studies...Catalyst; Reagent...",
        domain: "Hydrogen Generation",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/HYDROGEN/hydrogen.owl",
        domain_specific: true
    },
    tsim: {
        prefix: "tsim",
        uri: "http://dendro.fe.up.pt/ontology/trafficSim#",
        elements: Elements.ontologies.tsim,
        label: "Traffic Simulation",
        description: "Traffic Simulation studies...Driving cycle; Vehicle Mass...",
        domain: "Traffic Simulation",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/TRAFFIC_SIM/trafficSimDendro.owl",
        domain_specific: true
    },
    cep: {
        prefix: "cep",
        uri: "http://dendro.fe.up.pt/ontology/cep/",
        elements: Elements.ontologies.cep,
        label: "Cutting and Packing",
        description: "Cutting and packing optimization strategies...Solver configuration, Optimization strategy, Heuristics used...",
        domain: "Algorithms and optimization",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/CUTTING_PACKING/cep.owl",
        domain_specific: true
    },
    social: {
        prefix: "social",
        uri: "http://dendro.fe.up.pt/ontology/socialStudies#",
        elements: Elements.ontologies.social,
        label: "Social Studies",
        description: "Social and Behavioural Studies... Methodology, Sample procedure, Kind of data...",
        domain: "Social and Behavioural Science",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab/dendro-ontologies/master/SOCIAL_STUDIES/SocialStudies.owl",
        domain_specific: true
    },
    cfd: {
        prefix: "cfd",
        uri: "http://dendro.fe.up.pt/ontology/cfd#",
        elements: Elements.ontologies.cfd,
        label: "Fluid Dynamics",
        description: "Computational Fluid Dynamics... Flow Case, Initial Condition, Temporal Discretization...",
        domain: "Computational Fluid Dynamics",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab-rdm/dendro-ontologies/master/COMPUTATIONAL_FLUID_DYNAMICS/cfd.owl",
        domain_specific: true
    },
    tvu: {
        prefix: "tvu",
        uri: "http://dendro.fe.up.pt/ontology/tvu#",
        elements: Elements.ontologies.tvu,
        label: "Audiovisual Content",
        description: "Concepts for the description of datasets generated in the scope of audiovisual production",
        domain: "Audiovisual",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab/dendro-ontologies/master/TVU/TVU_XML.owl",
        domain_specific: true
    },
    po: {
        prefix: "po",
        uri: "http://purl.org/ontology/po/",
        elements: Elements.ontologies.po,
        label: "Programmes Ontology",
        description: "A vocabulary for programme data. It defines concepts such as brands, series, episodes, broadcasts, etc.",
        domain: "Programmes",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab/dendro-ontologies/master/PO/1.1.ttl",
        domain_specific: true
    },
    schema: {
        prefix: "schema",
        uri: "http://schema.org/",
        elements: Elements.ontologies.schema,
        label: "Schema.org",
        description: "General Purpose schema",
        domain: "Generic",
        downloadURL: "http://datashapes.org/schema.rdf",
        domain_specific: false
    },
    ddiup: {
        prefix: "ddiup",
        uri: "http://dendro.fe.up.pt/ontology/ddiup#",
        elements: Elements.ontologies.ddiup,
        label: "Data Documentation Initiative (DDI)",
        description: "Elements for the description of  data produced by surveys and other observational methods in the social, behavioral, economic, and health sciences",
        domain: "Generic",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab/dendro-ontologies/master/DDI_UP/ddi_up_ontology_2.0.rdf",
        domain_specific: false
    },
    disco: {
        prefix: "disco",
        uri: "http://rdf-vocabulary.ddialliance.org/discovery#",
        elements: Elements.ontologies.disco,
        label: "DDI-RDF Discovery Vocabulary",
        description: "A vocabulary for publishing metadata about data sets (research and survey data) into the Web of Linked Data",
        domain: "Generic",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab/dendro-ontologies/master/DISCOVERY/discovery.rdf",
        domain_specific: false
    },
    ssn: {
        prefix: "ssn",
        uri: "https://raw.githubusercontent.com/feup-infolab/dendro-ontologies/master/SSN/SSN.owl#",
        elements: Elements.ontologies.ssn,
        label: "Semantic Sensor Network",
        description: "Describes sensors and observations, and related concepts. It does not describe domain concepts, time, locations, etc. these are intended to be included from other ontologies via OWL imports.",
        domain: "Sensors and Observations",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab/dendro-ontologies/master/SSN/SSN.owl",
        domain_specific: true
    },
    m3lite: {
        prefix: "m3lite",
        uri: "https://raw.githubusercontent.com/feup-infolab/dendro-ontologies/master/M3-LITE/M3-lite.owl#",
        elements: Elements.ontologies.m3lite,
        label: "M3-lite Taxonomy",
        description: "A taxonomy that enables testbeds to semantically annotate the IoT data produced by heterogeneous devices. In this taxonomy, we classify devices, the domain of interests (health, smart home, smart kitchen, environmental monitoring, etc.), phenomena and unit of measurements",
        domain: "IoT",
        downloadURL: "https://raw.githubusercontent.com/feup-infolab/dendro-ontologies/master/M3-LITE/M3-lite.owl",
        domain_specific: true
    }
};

/**
 * DataStore configuration
 */

Config.dataStoreCompatibleExtensions = {
    xls: 1,
    xlsx: 1,
    csv: 1,
    ods: 1
};

/**
 * ElasticSearch Indexing Configuration
 *
 */
Config.indexableFileExtensions = {
    pdf: 1,
    doc: 1,
    docx: 1
};

Config.limits =
{
    index: {
        maxResults: 100,
        pageSize: 100
    },
    db: {
        maxResults: 1000,
        pageSize: 1000
    }
};

Config.streaming =
{
    db:
  {
      page_size: 200
  }
};

Config.useElasticSearchAuth = activeConfig.useElasticSearchAuth;

Config.elasticSearchAuthCredentials = activeConfig.elasticSearchAuthCredentials;

/**
 * Plugins
 */

Config.plugins = {
    folderName: "plugins"
};

/*
Element / Ontology related configuration
 */

Config.acl = {
    actions: {
        restore: "restore",
        backup: "backup",
        edit: "edit",
        delete: "delete",
        read: "read"
    },
    groups: {
        creator: "creator",
        admin: "admin"
    },
    allow: 1,
    deny: 0
};

/*
Backup and restore
 */

Config.packageMetadataFileName = "metadata.json";
Config.systemOrHiddenFilesRegexes = getConfigParameter("systemOrHiddenFilesRegexes");

/**
 * Thumbnail Generation
 */

if (isNull(Config.thumbnailableExtensions))
{
    Config.thumbnailableExtensions = rlequire("dendro", "public/shared/public_config.json").thumbnailable_file_extensions;
}

if (isNull(Config.iconableFileExtensions))
{
    Config.iconableFileExtensions = {};
    let extensions = fs.readdirSync(rlequire.absPathInApp("dendro", "public/images/icons/extensions"));

    for (let i = 0; i < extensions.length; i++)
    {
        if (extensions[i] !== "." && extensions[i] !== "..")
        {
            let extensionOnly = extensions[i].match(/file_extension_(.+)\.png/)[1];
            if (!isNull(extensionOnly))
            {
                Config.iconableFileExtensions[extensionOnly] = true;
            }
        }
    }
}

Config.thumbnails = {
    thumbnail_format_extension: "jpg",
    // every attribute of the size_parameters must be listed here for iteration TODO fix later
    sizes: ["big", "medium", "small", "icon"],
    size_parameters:
  {
      big: {
          description: "big",
          width: 256,
          height: 256
      },
      medium: {
          description: "medium",
          width: 128,
          height: 128
      },
      small: {
          description: "small",
          width: 64,
          height: 64
      },
      icon: {
          description: "icon",
          width: 32,
          height: 32
      },
      tiny: {
          description: "tiny",
          width: 16,
          height: 16
      }
  }
};

/*
MIME types
 */

Config.mimeType = function (extension)
{
    const mime = require("mime-types");
    if (isNull(mime.lookup(extension)))
    {
        return "application/octet-stream";
    }
    return mime.lookup(extension);
};

Config.swordConnection = {
    DSpaceServiceDocument: "/swordv2/servicedocument",
    EprintsServiceDocument: "/sword-app/servicedocument",
    EprintsCollectionRef: "/id/contents"
};

const Serializers = rlequire("dendro", "src/utils/serializers.js");

Config.defaultMetadataSerializer = Serializers.dataToJSON;
Config.defaultMetadataContentType = "text/json";

Config.metadataSerializers = {
    "application/text": Serializers.metadataToText,
    "application/txt": Serializers.metadataToText,
    "application/rdf": Serializers.metadataToRDF,
    "application/xml": Serializers.metadataToRDF,
    "application/json": Serializers.dataToJSON
};
Config.metadataContentTypes = {
    "application/text": "text/plain",
    "application/txt": "text/plain",
    "application/rdf": "text/xml",
    "application/xml": "text/xml",
    "application/json": "application/json"
};

Config.theme = getConfigParameter("theme");

Config.demo_mode = getConfigParameter("demo_mode");

if (Config.demo_mode.active)
{
    const exec = require("child_process").exec;

    Config.demo_mode.git_info = {};

    exec("git branch | grep \"^* .*$\" | cut -c 3- | tr -d \"\n\"",
        {
            cwd: Config.appDir
        },
        function (error, stdout, stderr)
        {
            if (isNull(error))
            {
                Logger.log_boot_message("Active branch : " + JSON.stringify(stdout));
                Config.demo_mode.git_info.active_branch = stdout;
            }
            else
            {
                Logger.log("error", "Unable to get active branch : " + JSON.stringify(error));
            }
        });

    exec("git log -1 | grep \"commit.*\" | cut -c 8- | tr -d \"\n\"",
        {
            cwd: Config.appDir
        }, function (error, stdout, stderr)
        {
            if (isNull(error))
            {
                Logger.log_boot_message("Last commit hash : " + JSON.stringify(stdout));
                Config.demo_mode.git_info.commit_hash = stdout;
            }
            else
            {
                Logger.log("error", "Unable to get commit hash : " + JSON.stringify(error));
            }
        });

    exec("git log -1 | grep \"Date:.*\" | cut -c 9- | tr -d \"\n\"",
        {
            cwd: Config.appDir
        }, function (error, stdout, stderr)
        {
            if (isNull(error))
            {
                Logger.log_boot_message("Last commit date : " + JSON.stringify(stdout));
                Config.demo_mode.git_info.last_commit_date = stdout;
            }
            else
            {
                Logger.log("error", "Unable to get last commit date : " + JSON.stringify(error));
            }
        });
}

Config.email = getConfigParameter("email");

Config.analytics_tracking_code = getConfigParameter("analytics_tracking_code");

Config.public_ontologies = getConfigParameter("public_ontologies");

// from https://github.com/lodash/lodash/issues/1743
/**
 * Returns TRUE if the first specified array contains all elements
 * from the second one. FALSE otherwise.
 *
 * @param {array} superset
 * @param {array} subset
 *
 * @returns {boolean}
 */
function arrayContainsArray (superset, subset)
{
    if (subset.length === 0)
    {
        return false;
    }
    return subset.every(function (value)
    {
        return (superset.indexOf(value) >= 0);
    });
}

// if we have unparametrized prefixes in the public ontologies inside deployment_configs.json, dendro should crash immediately
if (!arrayContainsArray(Object.keys(Config.enabledOntologies), Config.public_ontologies))
{
    const msg = `The public_ontologies value in deployment_configs contains prefixes not parametrized in the list of enabled ontologies in config.js. : ${_.difference(Config.public_ontologies, Object.keys(Config.enabledOntologies))}`;
    Logger.log("error", msg);
    throw new Error(msg);
}

Config.regex_routes = {
    project_root:
  {
      restore: new RegExp("/project/([^/]+)[/data]?$"),
      bagit: new RegExp("/project/([^/]+)[/data]?$")
  },
    inside_projects:
  {
      upload: new RegExp("/project/([^/]+)[/data]?((?=(.*)/upload/?$).*)$"),
      restore: new RegExp("/project/([^/]+)[/data]?((?=(.*)/restore/?$).*)$"),
      download: new RegExp("/project/([^/]+)[/data]?((?=(.*)/download/?$).*)$")
  }
};

Config.authentication = getConfigParameter("authentication");
Config.numCPUs = getConfigParameter("numCPUs");
Config.testing = getConfigParameter("testing");
Config.docker = getConfigParameter("docker");
Config.virtualbox = getConfigParameter("virtualbox");

if (Config.docker.active && Config.virtualbox.active)
{
    throw new Error("Cannot have docker and virtualbox flags active at the same time in the deployment config!");
}

if (process.env.NODE_ENV === "production")
{
    // detect slave / master status for production environments using pm2
    Config.runningAsSlave = false;

    const argv = require("yargs").argv;
    if (!isNull(argv.pm2_slave))
    {
        Config.runningAsSlave = true;
        // const simultaneousConnections = Config.maxSimultaneousConnectionsToDb / Config.numCPUs;
        // Config.maxSimultaneousConnectionsToDb = (simultaneousConnections >= 1) ? simultaneousConnections : 1;

        // THANK YOU VIRTUOSO! ONLY ONE CONNECTION OTHERWISE DATABASE CRASHES
        // (Communications Link Failure), EVEN THOUGH I AM CONTROLLING
        // SIMULTANEOUS CONNECTIONS with A QUEUE.
        Config.maxSimultaneousConnectionsToDb = 1;
    }
}

Config.toJSONObject = function ()
{
    const CircularJSON = require("circular-json");
    const string = CircularJSON.stringify(_.extend({}, Config));
    return JSON.parse(string);
};

module.exports.Config = Config;
