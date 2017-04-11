/**
 * Created by Filipe on 01/10/2014.
 */

var request = require('request');

Zenodo.apiURL = 'https://zenodo.org/api';
Zenodo.depositionsURL = Zenodo.apiURL + '/deposit/depositions/';
Zenodo.depositionFilesPath = '/files';
Zenodo.actionsEditPath = '/actions/edit';
Zenodo.actionsPublishPath = '/actions/publish';


function Zenodo(accessToken){
    this.oauth = {};
    if(accessToken == null){
        throw "Undefined access token";
    }
    else{
        this.accessToken = accessToken;
        this.accessTokenURL = '?access_token='+accessToken;
    }
};
Zenodo.prototype.getDeposition = function(depositionID, callback){

    request.get({
            url:Zenodo.depositionsURL+depositionID + this.accessTokenURL,
            json:true
        },
        function (e, r, data) {
            if(e){
                console.error(e);
                callback(true);
            }
            else{
                callback(false, data);
            }
        })
};
Zenodo.prototype.getDepositionsList = function(callback){

    request.get({
            url:Zenodo.depositionsURL+this.accessTokenURL,
            json:true
        },
        function (e, r, depositions) {
            if(e){
                console.error(e);
                callback(true);
            }
            else{
                callback(false, depositions);
            }
        })
};

Zenodo.prototype.createDeposition = function(data, callback){

    request.post({
            url :Zenodo.depositionsURL+this.accessTokenURL,
            body: {
                metadata:{
                    title: data.title || "no_title_available",
                    description:data.description || "no_description_available",
                    upload_type :"dataset",
                    creators: [{name : data.creator || 'no_creator_available'}],
                    access_right: "closed",
                    license: "cc-zero"
                }

            },
            json:true
        },
        function (e, r, depostition) {
            if(r.statusCode !="201")
            {
                console.error(depostition.message);
                callback(true, depostition);
            }
            else
            {
                callback(false,depostition);
            }
        })
};

Zenodo.prototype.uploadFileToDeposition = function(depositionID, file,callback){

    var fs = require('fs');
    var r = request.post({
            url :Zenodo.depositionsURL+depositionID+Zenodo.depositionFilesPath + this.accessTokenURL,
            json:true
        },
        function (e, r, data) {
            if(e){
                console.error(e);
                callback(true);
            }
            else{
                callback(false);
            }
        });

    var form = r.form();
    form.append('file',fs.createReadStream(file));
};
Zenodo.prototype.uploadMultipleFilesToDeposition = function(depositionID, files,callback){

    var async = require('async');
    var self = this;
    async.each(files, function(file, callback){
            self.uploadFileToDeposition(depositionID, file,function(err){
                if(err)
                {
                    callback(true);
                }
                else callback(false);
            })
        },
        function(err){
            if(err){
                callback(true);
            }
            else{
                callback(false);
            }
        })
};
Zenodo.prototype.depositionEdit = function(depositionID, callback){
    request.post({
            url :Zenodo.depositionsURL+depositionID+ Zenodo.actionsEditPath + this.accessTokenURL,
            json:true
        },
        function (e, r, data) {
            if(e){
                console.error(e);
                callback(true);
            }
            else{
                callback(false,data);
            }
        })
};
Zenodo.prototype.depositionPublish = function(depositionID, callback){
    request.post({
            url :Zenodo.depositionsURL+depositionID+ Zenodo.actionsPublishPath + this.accessTokenURL,
            json:true
        },
        function (e, r, data) {
            if(e){
                console.error(e);
                callback(true);
            }
            else{
                callback(false,data);
            }
        })
};

module.exports  = Zenodo;