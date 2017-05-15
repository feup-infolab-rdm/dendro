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
const appUtils = require(Config.absPathInTestsFolder("utils/app/appUtils.js"));

const demouser1 = require(Config.absPathInTestsFolder("mockdata/users/demouser1.js"));
const demouser2 = require(Config.absPathInTestsFolder("mockdata/users/demouser2.js"));
const demouser3 = require(Config.absPathInTestsFolder("mockdata/users/demouser3.js"));

const publicProject = require(Config.absPathInTestsFolder("mockdata/projects/public_project.js"));
const metadataOnlyProject = require(Config.absPathInTestsFolder("mockdata/projects/metadata_only_project.js"));
const privateProject = require(Config.absPathInTestsFolder("mockdata/projects/private_project.js"));

const folder = require(Config.absPathInTestsFolder("mockdata/folders/folder.js"));
const folderForDemouser2 = require(Config.absPathInTestsFolder("mockdata/folders/folderDemoUser2.js"));
const ontologyPrefix = "foaf";
var addContributorsToProjectsUnit = appUtils.requireUncached(Config.absPathInTestsFolder("units/projects/addContributorsToProjects.Unit.js"));
var db = appUtils.requireUncached(Config.absPathInTestsFolder("utils/db/db.Test.js"));

describe("Descriptors from foaf ontology", function (done) {
    before(function (done) {
        this.timeout(60000);
        addContributorsToProjectsUnit.setup(function (err, results) {
            should.equal(err, null);
            done();
        });
    });

    describe("[GET] /descriptors/from_ontology/foaf", function () {
        /**
         * PUBLIC PROJECT
         */
        it("[HTML] It should give a 405 error (method not supported) if the Accept: application/json Header was not sent. User logged in as demouser1(The creator of the Public project "+publicProject.handle +")", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(false, agent, ontologyPrefix, publicProject.handle, function (err, res) {
                    res.should.have.status(405);
                    err.message.should.equal("Method Not Allowed");
                    done();
                });
            });
        });

        it("[JSON] It should give an error when trying to get descriptors from foaf ontology when logged in as demouser1 and passing an unknown project handle in the query", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, "unknownProjectHandle", function (err, res) {
                    res.should.have.status(500);
                    done();
                });
            });
        });

        it("[JSON] It should give an error when trying to get descriptors from foaf ontology when logged in as demouser1 and passing null project handle in the query", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, null, function (err, res) {
                    res.should.have.status(500);
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from foaf ontology when logged in as demouser1(The creator of the Public project "+publicProject.handle +")", function (done) {
            //should return all the descriptors from this ontology -> currently 62 elements
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, publicProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(62);
                    done();
                });
            });
        });

        it("[JSON] It should get the descriptors from foaf ontology when logged in as demouser2(a collaborator of the Public project "+publicProject.handle +")", function (done) {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, publicProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(62);
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from foaf ontology when logged in as demouser3 (not Collaborator or creator of the Public project "+publicProject.handle +")", function (done) {
            //because it is a public project
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, publicProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(62);
                    done();
                });
            });
        });

        it("[JSON] It should not get descriptors from foaf ontology (when unauthenticated and accessing Public project "+publicProject.handle +")", function (done) {
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
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(false, agent, ontologyPrefix, metadataOnlyProject.handle, function (err, res) {
                    res.should.have.status(405);
                    err.message.should.equal("Method Not Allowed");
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from foaf ontology when logged in as demouser1 (The creator of the Metadata Only project "+metadataOnlyProject.handle +")", function (done) {
            //should return all the descriptors from this ontology -> currently 62 elements
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, metadataOnlyProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(62);
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from foaf ontology when logged in as demouser2 (collaborator of the Metadata Only project "+metadataOnlyProject.handle +")", function (done) {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, metadataOnlyProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(62);
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from foaf ontology when logged in as demouser3 (not collaborator or creator of the Metadata Only project "+metadataOnlyProject.handle +")", function (done) {
            //because it is a metadata-only project
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, metadataOnlyProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(62);
                    done();
                });
            });
        });

        it("[JSON] It should not get descriptors from foaf ontology (when unauthenticated and inside of the Metadata Only project "+metadataOnlyProject.handle +")", function (done) {
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
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(false, agent, ontologyPrefix, privateProject.handle, function (err, res) {
                    res.should.have.status(405);
                    err.message.should.equal("Method Not Allowed");
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from foaf ontology when logged in as demouser1 (The creator of the Private project "+privateProject.handle +")", function (done) {
            //should return all the descriptors from this ontology -> currently 62 elements
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, privateProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(62);
                    done();
                });
            });
        });

        it("[JSON] It should get descriptors from foaf ontology when logged in as demouser2 (a collaborator of the Private project "+privateProject.handle +")", function (done) {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, privateProject.handle, function (err, res) {
                    res.should.have.status(200);
                    res.body.descriptors.length.should.equal(62);
                    done();
                });
            });
        });

        it("[JSON] It should not get descriptors from foaf ontology when logged in as demouser3 (not collaborator or creator of the Private project "+privateProject.handle +")", function (done) {
            console.log(demouser3);
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent) {
                descriptorUtils.getProjectDescriptorsFromOntology(true, agent, ontologyPrefix, privateProject.handle, function (err, res) {
                    res.should.have.status(401);
                    done();
                });
            });
        });

        it("[JSON] It should not get descriptors from foaf ontology (when unauthenticated and inside of the Private project "+privateProject.handle +")", function (done) {
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
        appUtils.clearAppState(function (err, data) {
            should.equal(err, null);
            done();
        });
    });
});
