var chai = require('chai');
var chaiHttp = require('chai-http');
const should = chai.should();
var _ = require('underscore');
chai.use(chaiHttp);

const Config = GLOBAL.Config;

const userUtils = require(Config.absPathInTestsFolder("utils/user/userUtils.js"));
const itemUtils = require(Config.absPathInTestsFolder("utils/item/itemUtils.js"));
const projectUtils = require(Config.absPathInTestsFolder("utils/project/projectUtils.js"));
const repositoryUtils = require(Config.absPathInTestsFolder("utils/repository/repositoryUtils.js"));
const appUtils = require(Config.absPathInTestsFolder("utils/app/appUtils.js"));
const postUtils = require(Config.absPathInTestsFolder("utils/social/post.js"));

const demouser1 = require(Config.absPathInTestsFolder("mockdata/users/demouser1.js"));
const demouser2 = require(Config.absPathInTestsFolder("mockdata/users/demouser2.js"));
const demouser3 = require(Config.absPathInTestsFolder("mockdata/users/demouser3.js"));

const publicProject = require(Config.absPathInTestsFolder("mockdata/projects/public_project.js"));
const invalidProject = require(Config.absPathInTestsFolder("mockdata/projects/invalidProject.js"));

var createPostsUnit = appUtils.requireUncached(Config.absPathInTestsFolder("units/social/createPosts.Unit.js"));
var db = appUtils.requireUncached(Config.absPathInTestsFolder("utils/db/db.Test.js"));
let demouser1PostURIs;

describe("Social Dendro like a post tests", function () {
    before(function (done) {
        this.timeout(60000);
        createPostsUnit.setup(function (err, results) {
            should.equal(err, null);
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                postUtils.getAllPostsFromUserProjects(true, agent, function (err, res) {
                    res.statusCode.should.equal(200);
                    demouser1PostURIs = res.body;
                    done();
                });
            });
        });
    });

    //demouser1PostURIs[0].uri
    describe("[POST] /posts/like", function () {
        //TODO API ONLY
        it("Should give an error if the request type for this route is of type HTML", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                postUtils.likeOrUnlikeAPost(false, agent, demouser1PostURIs[0].uri, function (err, res) {
                    res.statusCode.should.equal(400);
                    done();
                });
            });
        });

        it("Should return an error if the user is not logged in", function (done) {
            var app = GLOBAL.tests.app;
            var agent = chai.request.agent(app);

            postUtils.likeOrUnlikeAPost(true, agent, demouser1PostURIs[0].uri, function (err, res) {
                res.statusCode.should.equal(401);
                done();
            });
        });

        it("Should return an error if the post that the demouser1 wants to like/unlike does not exist", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                postUtils.likeOrUnlikeAPost(true, agent, "unknownPostUri", function (err, res) {
                    res.statusCode.should.equal(404);
                    res.body.message.should.equal("Invalid post uri");
                    done();
                });
            });
        });

        it("Should return an error if the post that the demouser3 wants to like/unlike belongs to a project were the demouser3 is not a collaborator or creator", function (done) {
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent) {
                postUtils.likeOrUnlikeAPost(true, agent, demouser1PostURIs[0].uri, function (err, res) {
                    res.statusCode.should.equal(401);
                    done();
                });
            });
        });

        it("Should return a success message if the post that the demouser1 wants to LIKE belongs to a project were the demouser1 is a collaborator or creator", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                postUtils.likeOrUnlikeAPost(true, agent, demouser1PostURIs[0].uri, function (err, res) {
                    res.statusCode.should.equal(200);
                    res.body.message.should.equal("Post liked successfully");
                    done();
                });
            });
        });

        it("Should return a success message if the post that the demouser2 wants to LIKE belongs to a project were the demouser1 is a collaborator or creator", function (done) {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent) {
                postUtils.likeOrUnlikeAPost(true, agent, demouser1PostURIs[0].uri, function (err, res) {
                    res.statusCode.should.equal(200);
                    res.body.message.should.equal("Post liked successfully");
                    done();
                });
            });
        });

        it("Should return a success message if the post that the demouser2 wants to UNLIKE belongs to a project were the demouser1 is a collaborator or creator", function (done) {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent) {
                postUtils.likeOrUnlikeAPost(true, agent, demouser1PostURIs[0].uri, function (err, res) {
                    res.statusCode.should.equal(200);
                    res.body.message.should.equal("Like was removed");
                    done();
                });
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