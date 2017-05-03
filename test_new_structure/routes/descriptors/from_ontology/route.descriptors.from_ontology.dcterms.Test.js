var chai = require('chai');
var chaiHttp = require('chai-http');
const should = chai.should();
var _ = require('underscore');
chai.use(chaiHttp);

const Config = GLOBAL.Config;

const projectUtils = require(Config.absPathInTestsFolder("utils/project/projectUtils.js"));
const userUtils = require(Config.absPathInTestsFolder("utils/user/userUtils.js"));
const folderUtils = require(Config.absPathInTestsFolder("utils/folder/folderUtils.js"));
const httpUtils = require(Config.absPathInTestsFolder("utils/http/httpUtils.js"));
const descriptorUtils = require(Config.absPathInTestsFolder("utils/descriptor/descriptorUtils.js"));

const demouser1 = require(Config.absPathInTestsFolder("mockdata/users/demouser1.js"));
const demouser2 = require(Config.absPathInTestsFolder("mockdata/users/demouser2.js"));
const demouser3 = require(Config.absPathInTestsFolder("mockdata/users/demouser3.js"));

const publicProject = require(Config.absPathInTestsFolder("mockdata/projects/public_project.js"));
const metadataOnlyProject = require(Config.absPathInTestsFolder("mockdata/projects/metadata_only_project.js"));
const privateProject = require(Config.absPathInTestsFolder("mockdata/projects/private_project.js"));

const folder = require(Config.absPathInTestsFolder("mockdata/folders/folder.js"));
const folderForDemouser2 = require(Config.absPathInTestsFolder("mockdata/folders/folderDemoUser2.js"));
//require(Config.absPathInTestsFolder("units/projects/addContributorsToProjects.Unit.js")).setup();

var addContributorsToProjectsUnit = requireUncached(Config.absPathInTestsFolder("units/projects/addContributorsToProjects.Unit.js"));
var db = requireUncached(Config.absPathInTestsFolder("utils/db/db.Test.js"));

function requireUncached(module) {
    delete require.cache[require.resolve(module)]
    return require(module)
}

describe("Descriptors from dcterms ontology", function (done) {
    before(function (done) {
        this.timeout(60000);
        addContributorsToProjectsUnit.setup(function (err, results) {
            should.equal(err, null);
            done();
        });
    });

    describe("[GET] /descriptors/from_ontology/dcterms", function () {
        //A use case -> http://127.0.0.1:3001/descriptors/from_ontology/dcterms?project_handle=proj1
        /**
         * PUBLIC PROJECT
         */
        it("[HTML] It should give a 405 error (method not supported) if the Accept: application/json Header was not sent. User logged in as demouser1(The creator of the Public project "+publicProject.handle +")", function (done) {
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(false, agent, ontologyPrefix, publicProject.handle, function (err, res) {
                    res.should.have.status(405);
                    err.message.should.equal("Method Not Allowed");
                    done();
                });
            });
        });

        it("[JSON] It should give an error when trying to get descriptors from dcterms ontology when logged in as demouser1 and passing an unknown project handle in the query", function (done) {
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, "unknownProjectHandle", function (err, res) {
                    res.should.have.status(500);
                    done();
                });
            });
        });

        it("[JSON] It should give an error when trying to get descriptors from dcterms ontology when logged in as demouser1 and passing null project handle in the query", function (done) {
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, null, function (err, res) {
                    res.should.have.status(500);
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from dcterms ontology when logged in as demouser1(The creator of the Public project "+publicProject.handle +")", function (done) {
            //should return all the descriptors from this ontology -> currently 52 elements
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, publicProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(52);
                    done();
                });
            });
        });

        it("[JSON] It should get the descriptors from dcterms ontology when logged in as demouser2(a collaborator of the Public project "+publicProject.handle +")", function (done) {
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, publicProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(52);
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from dcterms ontology when logged in as demouser3 (not Collaborator or creator of the Public project "+publicProject.handle +")", function (done) {
            //because it is a public project
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, publicProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(52);
                    done();
                });
            });
        });

        it("[JSON] It should not get descriptors from dcterms ontology (when unauthenticated and accessing Public project "+publicProject.handle +")", function (done) {
            let ontologyPrefix = "dcterms";
            var app = GLOBAL.tests.app;
            var agent = chai.request.agent(app);
            descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, publicProject.handle, function (err, res) {
                res.should.have.status(401);
                done();
            });
        });

        /**
         * METADATA_ONLY PROJECT
         */
        it("[HTML] It should give a 405 error (method not supported) if the Accept: application/json Header was not sent. User logged in as demouser1 (The creator of the Metadata Only project "+metadataOnlyProject.handle +")", function (done) {
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(false, agent, ontologyPrefix, metadataOnlyProject.handle, function (err, res) {
                    res.should.have.status(405);
                    err.message.should.equal("Method Not Allowed");
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from dcterms ontology when logged in as demouser1 (The creator of the Metadata Only project "+metadataOnlyProject.handle +")", function (done) {
            //should return all the descriptors from this ontology -> currently 52 elements
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, metadataOnlyProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(52);
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from dcterms ontology when logged in as demouser2 (collaborator of the Metadata Only project "+metadataOnlyProject.handle +")", function (done) {
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, metadataOnlyProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(52);
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from dcterms ontology when logged in as demouser3 (not collaborator or creator of the Metadata Only project "+metadataOnlyProject.handle +")", function (done) {
            //because it is a metadata-only project
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, metadataOnlyProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(52);
                    done();
                });
            });
        });

        it("[JSON] It should not get descriptors from dcterms ontology (when unauthenticated and inside of the Metadata Only project "+metadataOnlyProject.handle +")", function (done) {
            let ontologyPrefix = "dcterms";
            var app = GLOBAL.tests.app;
            var agent = chai.request.agent(app);
            descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, metadataOnlyProject.handle, function (err, res) {
                res.should.have.status(401);
                done();
            });
        });

        /**
         * PRIVATE PROJECT
         */
        it("[HTML] It should give a 405 error (method not supported) if the Accept: application/json Header was not sent. User logged in as demouser1 (The creator of the Private project "+privateProject.handle +")", function (done) {
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(false, agent, ontologyPrefix, privateProject.handle, function (err, res) {
                    res.should.have.status(405);
                    err.message.should.equal("Method Not Allowed");
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from dcterms ontology when logged in as demouser1 (The creator of the Private project "+privateProject.handle +")", function (done) {
            //should return all the descriptors from this ontology -> currently 52 elements
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, privateProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(52);
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from dcterms ontology when logged in as demouser2 (a collaborator of the Private project "+privateProject.handle +")", function (done) {
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, privateProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(52);
                    done();
                });
            });
        });

        it("[JSON] It should not get descriptors from dcterms ontology when logged in as demouser3 (not collaborator or creator of the Private project "+privateProject.handle +")", function (done) {
            let ontologyPrefix = "dcterms";
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, privateProject.handle, function (err, res) {
                    res.should.have.status(401);
                    done();
                });
            });
        });

        it("[JSON] It should not get descriptors from dcterms ontology (when unauthenticated and inside of the Private project "+privateProject.handle +")", function (done) {
            let ontologyPrefix = "dcterms";
            var app = GLOBAL.tests.app;
            var agent = chai.request.agent(app);
            descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, privateProject.handle, function (err, res) {
                res.should.have.status(401);
                done();
            });
        });
    });

    after(function (done) {
        //destroy graphs
        this.timeout(60000);
        db.deleteGraphs(function (err, data) {
            should.equal(err, null);
            GLOBAL.tests.server.close();
            done();
        });
    });
});
