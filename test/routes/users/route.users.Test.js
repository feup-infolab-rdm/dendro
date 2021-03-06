const chai = require("chai");
const chaiHttp = require("chai-http");
const should = chai.should();
const _ = require("underscore");
chai.use(chaiHttp);

const rlequire = require("rlequire");
const Config = rlequire("dendro", "src/models/meta/config.js").Config;

const userUtils = rlequire("dendro", "test/utils/user/userUtils.js");

const demouser1 = rlequire("dendro", "test/mockdata/users/demouser1.js");
const demouser2 = rlequire("dendro", "test/mockdata/users/demouser2.js");
const demouser3 = rlequire("dendro", "test/mockdata/users/demouser3.js");

const appUtils = rlequire("dendro", "test/utils/app/appUtils.js");
const createUserUnit = rlequire("dendro", "test/units/users/createUsers.Unit.js");

// to review naming before mergin to master

describe("/users", function ()
{
    this.timeout(Config.testsTimeout);
    before(function (done)
    {
        createUserUnit.setup(function (err, results)
        {
            should.equal(err, null);
            done();
        });
    });

    it("[HTML] should list all users when logged in as demouser1.username", function (done)
    {
        const app = global.tests.app;
        const agent = chai.request.agent(app);
        userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
        {
            userUtils.listAllUsers(false, agent, function (err, res)
            {
                res.should.have.status(200);
                res.text.should.contain("Demo User 1");
                done();
            });
        });
    });

    it("[JSON]  should list all users when logged in as demouser1.username", function (done)
    {
        const app = global.tests.app;
        const agent = chai.request.agent(app);
        userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
        {
            userUtils.listAllUsers(true, agent, function (err, res)
            {
                res.should.have.status(200);
                res.text.should.contain("demouser1");
                done();
            });
        });
    });

    it("[HTML] should list all users when logged in as demouser2.username", function (done)
    {
        const app = global.tests.app;
        const agent = chai.request.agent(app);
        userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent)
        {
            userUtils.listAllUsers(false, agent, function (err, res)
            {
                res.should.have.status(200);
                res.text.should.contain("Demo User 1");
                res.text.should.contain("Demo User 2");
                res.text.should.not.contain("idontexist123");
                done();
            });
        });
    });

    it("[JSON]  should list all users when logged in as demouser2.username", function (done)
    {
        const app = global.tests.app;
        const agent = chai.request.agent(app);
        userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent)
        {
            userUtils.listAllUsers(true, agent, function (err, res)
            {
                res.should.have.status(200);
                res.text.should.contain("demouser1");
                res.text.should.contain("demouser2");
                res.text.should.not.contain("idontexist123");
                done();
            });
        });
    });

    it("[HTML] should list all users when NOT logged in", function (done)
    {
        const app = global.tests.app;
        const agent = chai.request.agent(app);
        userUtils.listAllUsers(false, agent, function (err, res)
        {
            res.should.have.status(200);
            res.text.should.contain("Demo User 1");
            res.text.should.contain("Demo User 2");
            res.text.should.not.contain("idontexist123");
            done();
        });
    });

    it("[JSON] should list all users when NOT logged in", function (done)
    {
        const app = global.tests.app;
        const agent = chai.request.agent(app);
        userUtils.listAllUsers(true, agent, function (err, res)
        {
            res.should.have.status(200);
            res.text.should.contain("demouser1");
            res.text.should.contain("demouser2");
            res.text.should.not.contain("idontexist123");
            done();
        });
    });

    after(function (done)
    {
        appUtils.clearAppState(function (err, data)
        {
            should.equal(err, null);
            done();
        });
    });
});
