const Pathfinder = global.Pathfinder;
const isNull = require(Pathfinder.absPathInSrcFolder("/utils/null.js")).isNull;
const Logger = require(Pathfinder.absPathInSrcFolder("utils/logger.js")).Logger;
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;
const MongoClient = require("mongodb").MongoClient;
const Agenda = require("agenda");
const fs = require("fs");

class Job
{
    static initDependencies (callback)
    {
        const initMongoClient = function (callback) {
            Logger.log_boot_message("Connecting to MongoDB Jobs storage running on " + Config.mongoDBHost + ":" + Config.mongoDbPort);
            const url = "mongodb://" + Config.mongoDBHost + ":" + Config.mongoDbPort + "/" + Config.mongoJobCollectionName;

            MongoClient.connect(url, function (err, db)
            {
                if (err)
                {
                    return callback("[ERROR] Connecting to MongoDB Jobs storage running on " + Config.mongoDBHost + ":" + Config.mongoDbPort + "\n Error description : " + JSON.stringify(db));
                }
                Logger.log_boot_message("Connected to MongoDB Jobs storage running on " + Config.mongoDBHost + ":" + Config.mongoDbPort);
                Job._jobsStorageClient = db;
                callback(null);
            });
        };

        const initAgenda = function (callback) {
            let agenda = new Agenda({mongo: Job._jobsStorageClient});
            Config.jobTypes = process.env.JOB_TYPES ? process.env.JOB_TYPES.split(',') : [];
            Job._agenda = agenda;
            Config.jobTypes.forEach(function(type) {
                let JobType = require(Pathfinder.absPathInSrcFolder("/jobs/models/" + type))[type];
                JobType.callDefine();
                JobType.registerJobEvents();
            });
            callback(null);
        };


        initMongoClient(function (err) {
            if(isNull(err))
            {
                initAgenda(function (err) {
                   if(isNull(err))
                   {
                       Logger.log("info", "Job dependencies are now set!");
                       callback(null);
                   }
                   else
                   {
                       Logger.log("error", "Job dependencies Agenda error: "  + JSON.stringify(err));
                       callback(err);
                   }
                });
            }
            else
            {
                Logger.log("error", "Job dependencies MongoClient error: "  + JSON.stringify(err));
                callback(err);
            }
        });
    }

    static registerJobEvents (jobName, successHandlerFunction, errorHandlerFunction)
    {
        Job._agenda.on("success:" + jobName, function(job) {
            successHandlerFunction(job);
        });

        Job._agenda.on("fail:" + jobName, function(err, job) {
            errorHandlerFunction(job);
        });
    }

    static callDefine (jobName, jobDefinitionFunction)
    {
        Job._agenda.define(jobName, function (job, done) {
            jobDefinitionFunction(job, done);
        });
    }

    constructor (name, jobData)
    {
        let self = this;
        self.jobData = jobData;
        self.name = name;
    }

    start (callback)
    {
        let self = this;
        Job._agenda.now(self.name, self.jobData, function (info) {
            callback(null);
        });
    }

    static fetchJobsStillInMongoAndRestartThem (jobName, restartJobFunction)
    {
        Logger.log("info", "Attempting to restart any " + jobName +" remaining in mongodb");
        Job._agenda.jobs({name: jobName}, function(err, jobs) {
            if(isNull(err))
            {
                restartJobFunction(jobs);
            }
            else
            {
                Logger.log("error", "Error at fetchJobsStillInMongoAndRestartThem: " + JSON.stringify(err));
            }
        });
    }
}

module.exports.Job = Job;
