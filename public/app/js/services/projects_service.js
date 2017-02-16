'use strict';

angular.module('dendroApp.services')
    .service('projectsService',
        ['$q','$http','windowService','$location',
            function ($q, $http, windowService, $location)
            {
                this.create_new_project = function(new_project)
                {
                    if(new_project.ddr == null)
                    {
                        new_project.ddr = {};
                    }


                    var deferred = $q.defer();

                    var requestPayload = JSON.stringify(new_project);

                    var URL = windowService.get_current_url();

                    $http({
                        method: 'POST',
                        url: URL,
                        data: requestPayload,
                        contentType: "application/json",
                        headers: {'Accept': "application/json"}
                    }).then(function (response)
                        {
                            $location.url('/');
                            var data = response.data;
                            deferred.resolve(data);
                        }
                    ).catch(function(error)
                        {
                            var serverResponse = error.data;
                            deferred.reject(serverResponse);
                        }
                    );

                    return deferred.promise;

                };
        }]);