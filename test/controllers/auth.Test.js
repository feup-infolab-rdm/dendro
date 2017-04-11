process.env.NODE_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
chai.use(chaiHttp);

const should = chai.should();

let agent = null;

const demouser1 = require("../mockdata/users/demouser1.js");
const demouser2 = require("../mockdata/users/demouser2.js");

const registeredUser1 = require("../mockdata/users/registereduser1");
const registeredUser2 = require("../mockdata/users/registereduser2");

const userUtils = require('./../utils/user/userUtils.js');
const authUtils = require('./../utils/auth/authUtils.js');

describe('/register', function () {
    it('[JSON] should not get the registration page because registration is not supported via API', function (done) {
        const app = GLOBAL.tests.app;
        const agent = chai.request.agent(app);
        authUtils.getRegisterUser(true, agent, function (err, res) {
            res.should.have.status(405);
            res.text.should.not.contain('Register new user');
            done();
        });
    });

    it('[JSON] should not register the ' + registeredUser1.username + " user because registration is not supported via API", function (done) {
        const app = GLOBAL.tests.app;
        const agent = chai.request.agent(app);
        authUtils.postRegisterUser(true, agent, registeredUser1, function (err, res) {
            res.should.have.status(405);
            res.text.should.not.contain('Register new user');
            done();
        });
    });

    it('[HTML] should get the registration page', function (done) {
        const app = GLOBAL.tests.app;
        const agent = chai.request.agent(app);
        authUtils.getRegisterUser(false, agent, function (err, res) {
            res.should.have.status(200);
            res.text.should.contain('Register new user');
            done();
        });
    });

    it('[HTML] should not register the ' + registeredUser1.username + " user if it misses a required field (password)", function (done) {
        const app = GLOBAL.tests.app;
        const agent = chai.request.agent(app);

        let defectiveRegisteredUser1 = JSON.parse(JSON.stringify(registeredUser1));
        delete defectiveRegisteredUser1.password;

        authUtils.postRegisterUser(false, agent, defectiveRegisteredUser1, function (err, res) {
            res.should.have.status(200);
            res.text.should.contain("Please specify your password");
            done();
        });
    });


    it('[HTML] should register the ' + registeredUser1.username + " user", function (done) {
        const app = GLOBAL.tests.app;
        const agent = chai.request.agent(app);
        authUtils.postRegisterUser(false, agent, registeredUser1, function (err, res) {
            res.should.have.status(200);
            res.text.should.contain("New user " + registeredUser1.username +" created successfully. You can now login with the username and password you specified");
            done();
        });
    });

    it('[HTML] should not be able to register the ' + registeredUser1.username + " user because it was already registered", function (done) {
        const app = GLOBAL.tests.app;
        const agent = chai.request.agent(app);
        authUtils.postRegisterUser(false, agent, registeredUser1, function (err, res) {
            res.should.have.status(200);
            res.text.should.contain("Username already exists");
            done();
        });
    });

    it('[HTML] should register the ' + registeredUser2.username + " user because it does not exist.", function (done) {
        const app = GLOBAL.tests.app;
        const agent = chai.request.agent(app);
        authUtils.postRegisterUser(false, agent, registeredUser2, function (err, res) {
            res.should.have.status(200);
            res.text.should.contain("New user " + registeredUser2.username +" created successfully. You can now login with the username and password you specified.");
            done();
        });
    });
});

describe('/login', function () {
    it('[HTML] should show the login page', function (done) {
        const app = GLOBAL.tests.app;
        chai.request(app)
            .get('/login')
            .end((err, res) => {
                res.should.have.status(200);
                res.text.should.contain('Please sign in');
                done();
            });
    });

    it('[HTML] should not login the demo user when wrong password is provided', function (done) {
        const app = GLOBAL.tests.app;
        chai.request(app)
            .post('/login')
            .send({'username': demouser1.username, 'password': 'WRONG_PASSWORD'})
            .end((err, res) => {
                res.should.have.status(200);
                res.text.should.contain('Please sign in');
                done();
            });
    });

    it('[HTML] should login ' + demouser1.username + ' with correct password', function (done) {
        const app = GLOBAL.tests.app;
        const agent = chai.request.agent(app);

        GLOBAL.tests.agent = agent;

        agent
            .post('/login')
            .send({'username': demouser1.username, 'password':  demouser1.password })
            .end((err, res) => {
                res.should.have.status(200);
                res.text.should.include('Your projects');
                done();
            });
    });

    it('[HTML] should logout the ' + demouser1.username + " user if correctly authenticated.", function (done) {
        const agent = GLOBAL.tests.agent;

        agent
            .get('/logout')
            .end((err, res) => {
                res.should.have.status(200);
                res.text.should.include('Successfully logged out');
                done();
            });
    });

    it('[HTML] should not logout an unauthenticated user', function (done) {
        const agent = GLOBAL.tests.agent;

        agent
            .get('/logout')
            .end((err, res) => {
                res.should.have.status(200);
                res.text.should.not.include('Successfully logged out');
                res.text.should.include('Please log into the system');
                done();
            });
    });

    it('[HTML] should login ' + demouser1.username + " while " + demouser2.username + " is logged in, replacing it", function (done) {
        const app = GLOBAL.tests.app;
        const agent = chai.request.agent(app);

        GLOBAL.tests.agent = agent;

        agent
            .post('/login')
            .send({'username': demouser2.username, 'password':  demouser2.password })
            .end((err, res) => {
                res.should.have.status(200);
                res.text.should.contain("Your projects");

                agent
                    .get('/users/loggedUser')
                    .end((err, res) =>
                    {
                        res.should.have.status(200);
                        res.text.should.contain(demouser2.username);

                        agent
                            .post('/login')
                            .send({'username': demouser1.username, 'password':  demouser1.password })
                            .end((err, res) => {
                                res.should.have.status(200);
                                res.text.should.contain("Your projects");

                                agent
                                    .get('/users/loggedUser')
                                    .end((err, res) =>
                                    {
                                        res.should.have.status(200);
                                        res.text.should.contain(demouser1.username);
                                        done()
                                    });
                            });
                    });
            });
    });

    /**
     * API Coverage
     */

    it('[JSON] should not login the demo user when wrong password is provided', function (done) {
        const app = GLOBAL.tests.app;
        chai.request(app)
            .post('/login')
            .set('Accept', 'application/json')
            .send({'username': demouser1.username, 'password': 'WRONG_PASSWORD'})
            .end((err, res) => {
                res.should.have.status(401);
                JSON.parse(res.text).result.should.equal('error');
                JSON.parse(res.text).message.should.equal('Invalid username/password combination.');
                done();
            });
    });

    it('[JSON] should login ' + demouser1.username + ' with correct password', function (done) {
        const app = GLOBAL.tests.app;
        const agent = chai.request.agent(app);

        GLOBAL.tests.agent = agent;

        agent
            .post('/login')
            .set('Accept', 'application/json')
            .send({'username': demouser1.username, 'password':  demouser1.password })
            .end((err, res) => {
                res.should.have.status(200);
                JSON.parse(res.text).result.should.equal('ok');
                JSON.parse(res.text).message.should.equal("User "+demouser1.username+" signed in.");
                done();
            });
    });

    it('[JSON] should logout the ' + demouser1.username + " user if correctly authenticated.", function (done) {
        const agent = GLOBAL.tests.agent;

        agent
            .get('/logout')
            .set('Accept', 'application/json')
            .end((err, res) => {
                res.should.have.status(200);
                res.text.should.include('Successfully logged out');
                done();
            });
    });

    it('[JSON] should not logout an unauthenticated user', function (done) {
        const agent = GLOBAL.tests.agent;

        agent
            .get('/logout')
            .set('Accept', 'application/json')
            .end((err, res) => {
                res.should.have.status(401);
                JSON.parse(res.text).result.should.equal('error');
                JSON.parse(res.text).message.should.equal('Action not permitted. You are not logged into the system.');
                done();
            });
    });

    it('[JSON] should login ' + demouser1.username + " while " + demouser2.username + " is logged in, replacing it", function (done) {
        const app = GLOBAL.tests.app;
        const agent = chai.request.agent(app);

        GLOBAL.tests.agent = agent;

        agent
            .post('/login')
            .set('Accept', 'application/json')
            .send({'username': demouser2.username, 'password':  demouser2.password })
            .end((err, res) => {
                res.should.have.status(200);
                JSON.parse(res.text).result.should.equal("ok");
                JSON.parse(res.text).message.should.equal('User '+demouser2.username+' signed in.');

                agent
                    .get('/users/loggedUser')
                    .set('Accept', 'application/json')
                    .end((err, res) =>
                    {
                        res.should.have.status(200);
                        JSON.parse(res.text).ddr.username.should.equal(demouser2.username);

                        agent
                            .post('/login')
                            .set('Accept', 'application/json')
                            .send({'username': demouser1.username, 'password':  demouser1.password })
                            .end((err, res) => {
                                res.should.have.status(200);
                                JSON.parse(res.text).result.should.equal("ok");
                                JSON.parse(res.text).message.should.equal('User '+demouser1.username+' signed in.');

                                agent
                                    .get('/users/loggedUser')
                                    .set('Accept', 'application/json')
                                    .end((err, res) =>
                                    {
                                        res.should.have.status(200);
                                        JSON.parse(res.text).ddr.username.should.equal(demouser1.username);
                                        done();
                                    });
                            });
                    });
            });
    });
});



