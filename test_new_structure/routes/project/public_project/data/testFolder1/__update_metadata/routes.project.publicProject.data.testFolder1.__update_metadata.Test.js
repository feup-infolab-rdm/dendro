var chai = require('chai');
var chaiHttp = require('chai-http');
const should = chai.should();
var _ = require('underscore');
chai.use(chaiHttp);

const Config = GLOBAL.Config;

const userUtils = require(Config.absPathInTestsFolder("utils/user/userUtils.js"));
const itemUtils = require(Config.absPathInTestsFolder("utils/item/itemUtils.js"));
const appUtils = require(Config.absPathInTestsFolder("utils/app/appUtils.js"));

const demouser1 = require(Config.absPathInTestsFolder("mockdata/users/demouser1.js"));
const demouser2 = require(Config.absPathInTestsFolder("mockdata/users/demouser2.js"));
const demouser3 = require(Config.absPathInTestsFolder("mockdata/users/demouser3.js"));

const publicProject = require(Config.absPathInTestsFolder("mockdata/projects/public_project.js"));
const invalidProject = require(Config.absPathInTestsFolder("mockdata/projects/invalidProject.js"));

const testFolder1 = require(Config.absPathInTestsFolder("mockdata/folders/testFolder1.js"));
const notFoundFolder = require(Config.absPathInTestsFolder("mockdata/folders/notFoundFolder.js"));
const folderForDemouser2 = require(Config.absPathInTestsFolder("mockdata/folders/folderDemoUser2"));
var createFoldersUnit = appUtils.requireUncached(Config.absPathInTestsFolder("units/folders/createFolders.Unit.js"));
var db = appUtils.requireUncached(Config.absPathInTestsFolder("utils/db/db.Test.js"));

describe("Public project testFolder1 level update_metadata", function () {
    before(function (done) {
        this.timeout(60000);
        createFoldersUnit.setup(function (err, results) {
            should.equal(err, null);
            done();
        });
    });

    describe("[POST] [PUBLIC PROJECT] /project/" + publicProject.handle + "/data/:foldername?update_metadata", function() {
        //API ONLY

        it("Should give an error if the request type for this route is HTML", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                itemUtils.updateItemMetadata(false, agent, publicProject.handle, testFolder1.name, testFolder1.metadata, function (err, res) {
                    res.statusCode.should.equal(400);
                    done();
                });
            });
        });

        it("Should give an error message when a project does not exist", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                itemUtils.updateItemMetadata(true, agent, invalidProject.handle, testFolder1.name, testFolder1.metadata, function (err, res) {
                    res.statusCode.should.equal(401);
                    //jsonOnly, agent, projectHandle, itemPath, cb
                    itemUtils.getItemMetadata(true, agent, invalidProject.handle, testFolder1.name, function (error, response) {
                        response.statusCode.should.equal(500);
                        done();
                    });
                });
            });
        });

        it("Should give an error message when the folder does not exist", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                itemUtils.updateItemMetadata(true, agent, publicProject.handle, notFoundFolder.name, testFolder1.metadata, function (err, res) {
                    res.statusCode.should.equal(404);
                    //jsonOnly, agent, projectHandle, itemPath, cb
                    itemUtils.getItemMetadata(true, agent, publicProject.handle, notFoundFolder.name, function (error, response) {
                        response.statusCode.should.equal(500);
                        done();
                    });
                });
            });
        });

        it("Should give an error when the user is not authenticated", function (done) {
            var app = GLOBAL.tests.app;
            var agent = chai.request.agent(app);
            itemUtils.updateItemMetadata(true, agent, publicProject.handle, testFolder1.name, testFolder1.metadata, function (err, res) {
                res.statusCode.should.equal(401);
                //Because the project is public, the unauthenticated user can see metadata
                itemUtils.getItemMetadata(true, agent, publicProject.handle, testFolder1.name, function (error, response) {
                    response.statusCode.should.equal(200);
                    JSON.parse(response.text).descriptors.length.should.equal(0);
                    done();
                });
            });
        });

        it("Should give an error when an invalid descriptor is used to update the metadata of a folder", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                itemUtils.updateItemMetadata(true, agent, publicProject.handle, testFolder1.name, testFolder1.invalidMetadata, function (err, res) {
                    res.statusCode.should.equal(400);
                    itemUtils.getItemMetadata(true, agent, publicProject.handle, testFolder1.name, function (error, response) {
                        response.statusCode.should.equal(200);
                        JSON.parse(response.text).descriptors.length.should.equal(0);
                        done();
                    });
                });
            });
        });

        it("Should give a success response when the user is logged in as demouser2(a collaborator in the project with demouser1) and tries to update a metadata of a folder with a valid descriptor", function (done) {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent) {
                itemUtils.updateItemMetadata(true, agent, publicProject.handle, folderForDemouser2.name, folderForDemouser2.metadata, function (err, res) {
                    res.statusCode.should.equal(200);
                    //jsonOnly, agent, projectHandle, itemPath, cb
                    itemUtils.getItemMetadata(true, agent, publicProject.handle, folderForDemouser2.name, function (error, response) {
                        response.statusCode.should.equal(200);
                        JSON.parse(response.text).descriptors.length.should.equal(folderForDemouser2.metadata.length);
                        done();
                    });
                });
            });
        });

        it("Should give an error when the user is logged in as demouser3(nor collaborator nor creator of the project) and tries to update a metadata of a folder with a valid descriptor", function (done) {
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent) {
                itemUtils.updateItemMetadata(true, agent, publicProject.handle, testFolder1.name, testFolder1.metadata, function (err, res) {
                    res.statusCode.should.equal(401);
                    //jsonOnly, agent, projectHandle, itemPath, cb
                    itemUtils.getItemMetadata(true, agent, publicProject.handle, testFolder1.name, function (error, response) {
                        response.statusCode.should.equal(200);
                        JSON.parse(response.text).descriptors.length.should.equal(0);
                        done();
                    });
                });
            });
        });

        it("Should give a success response when the user is logged in as demouser1(the creator of the project) and tries to update a metadata of a folder with a valid descriptor", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                itemUtils.updateItemMetadata(true, agent, publicProject.handle, testFolder1.name, testFolder1.metadata, function (err, res) {
                    res.statusCode.should.equal(200);
                    //jsonOnly, agent, projectHandle, itemPath, cb
                    itemUtils.getItemMetadata(true, agent, publicProject.handle, testFolder1.name, function (error, response) {
                        response.statusCode.should.equal(200);
                        JSON.parse(response.text).descriptors.length.should.equal(testFolder1.metadata.length);
                        done();
                    });
                });
            });
        })
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