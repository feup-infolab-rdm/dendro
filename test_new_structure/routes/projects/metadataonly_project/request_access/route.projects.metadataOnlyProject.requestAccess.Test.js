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

const metadataProject = require(Config.absPathInTestsFolder("mockdata/projects/metadata_only_project.js"));

const folder = require(Config.absPathInTestsFolder("mockdata/folders/folder.js"));

var db = requireUncached(Config.absPathInTestsFolder("utils/db/db.Test.js"));
var createProjectsUnit = requireUncached(Config.absPathInTestsFolder("units/projects/createProjects.Unit.js"));

function requireUncached(module) {
    delete require.cache[require.resolve(module)]
    return require(module)
}

describe("Request access to metadata only project", function (done) {
    before(function (done) {
        this.timeout(60000);
        createProjectsUnit.setup(function (err, results) {
            should.equal(err, null);
            done();
        });
    });

    describe("[GET] /project/:handle/request_access " + "[" + metadataProject.handle + "]", function () {
        
        it("Should get an error when trying to access the request access to a project HTML page when not authenticated", function (done) {
            var app = GLOBAL.tests.app;
            var agent = chai.request.agent(app);
            projectUtils.getRequestProjectAccessPage(false, agent, metadataProject.handle, function (err, res) {
                res.statusCode.should.equal(200);
                res.text.should.contain("<h1 class=\"page-header\">\n        Please sign in\n    </h1>");
                done();
            });
        });

        it("Should get an error when trying to access the request access to a project that does not exist event when authenticated", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                projectUtils.getRequestProjectAccessPage(false, agent, "ARandomProjectHandle", function (err, res) {
                    res.statusCode.should.equal(200);
                    res.text.should.contain("error");//TODO the app is not giving an error when the project does not exist
                    done();
                });
            });
        });

        it("Should get the request access to a project HTML page when authenticated as any user", function (done) {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent) {
                projectUtils.getRequestProjectAccessPage(false, agent, metadataProject.handle, function (err, res) {
                    res.statusCode.should.equal(200);
                    res.text.should.contain("<button type=\"submit\" class=\"btn btn-sm btn-success\">Request access for project " + "\'" + metadataProject.handle + "\'</button>");
                    done();
                });
            });
        });

        it("Should give an error when the request type for this route is of type JSON", function (done) {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent) {
                projectUtils.getRequestProjectAccessPage(true, agent, metadataProject.handle, function (err, res) {
                    res.statusCode.should.equal(400);
                    res.body.message.should.equal("API Request not valid for this route.");
                    done();
                });
            });
        })
    });

    describe("[POST] /project/:handle/request_access" + "[" + metadataProject.handle + "]", function () {
        //TODO HTML ONLY -> also sends flash messages with success or error responses
        //TODO make a request to JSON API, should return invalid request
        //TODO TEST for all project types

        it("Should get an error when user is not authenticated", function (done) {
            var app = GLOBAL.tests.app;
            var agent = chai.request.agent(app);

            projectUtils.requestAccessToProject(false, agent, metadataProject.handle, function (err, res) {
                res.statusCode.should.equal(200);
                res.text.should.contain("<p>Please log into the system.</p>");
                done();
            });
        });

        it("Should successfully request access to an existing project authenticated as demouser2 to a project created by demouser1", function (done) {
            done(1);
            //TODO mailer is not working
        });

        it("Should give an error trying to request access to a project that does not exist", function (done) {
            done(1);
        });

        it("Should give an error trying to request access, logged in as demouser1, to a project where demouser1 already is a creator", function (done) {
            done(1);
        });

        it("Should give an error trying to request access, logged in as demouser1, to a project where demouser1 already is a collaborator", function (done) {
            done(1);
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