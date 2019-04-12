angular.module("dendroApp.controllers", [])
/**
 *  Deposit registry controller
 */
    .controller("depositCtrl", function (
        $scope,
        $http,
        listings,
        focus,
        preview,
        $localStorage,
        $timeout,
        metadataService,
        windowService,
        usersService,
        depositsService
    )
    {
        $scope.active_tab = null;
        $scope.search_settings = {
            offset: 1,
            page: 5,
            totalDeposits: 0
        };

        $scope.search = {

            creator: {
                type: "text",
                label: "Username",
                key: "creator",
                value: ""
            },
            project: {
                type: "text",
                label: "Project",
                key: "project",
                value: ""
            },
            dateFrom: {
                type: "date",
                label: "Date Start",
                key: "dateFrom",
                value: ""
            },
            dateTo: {
                type: "date",
                label: "Date End",
                key: "dateTo",
                value: ""
            },
            privateDeposit: {
                type: "checkbox",
                list: true,
                label: "Privacy",
                key: "private",
                value: [
                    {
                        name: "Public deposit",
                        value: true
                    },
                    {
                        name: "Private deposit",
                        value: true
                    },
                    {
                        name: "Metadata only",
                        value: true
                    }]
            },
            system: {
                type: "checkbox",
                list: true,
                label: "Platform Used",
                key: "platforms",
                value: [
                    {
                        name: "CKAN",
                        value: true
                    },
                    {
                        name: "Dendro",
                        value: true
                    },
                    {
                        name: "DSpace",
                        value: true
                    },
                    {
                        name: "EPrints",
                        value: true
                    },
                    {
                        name: "Figshare",
                        value: true
                    },
                    {
                        name: "Zenodo",
                        value: true
                    },
                    {
                        name: "EUDAT B2Share",
                        value: true
                    }
                ]
            },
            ordering: {
                type: "dropdown",
                list: true,
                label: "Order By",
                key: "ordering",
                selected: "date descending",
                value: [
                    {
                        label: "date ascending"
                    },
                    {
                        name: "date descending"
                    },
                    {
                        name: "username ascending"
                    },
                    {
                        name: "username descending"
                    },
                    {
                        name: "project ascending"
                    },
                    {
                        name: "project descending"
                    }
                ]
            },
            keywords: {
                type: "dropdown",
                list: true,
                label: "Keywords",
                key: "keywords",
                selected: "Any of",
                value: [
                    {
                        name: "Any off"
                    },
                    {
                        name: "All off"
                    }
                ]
            },
            keyword: {
                type: "text",
                key: "keyWord",
                value: ""
            },
            popularTag: {
                type: "dropdown",
                list: true,
                label: "Popular tags",
                key: "popularTags",
                selected: "Any of",
                value: [
                    {
                        name: "Any off"
                    },
                    {
                        name: "All off"
                    }
                ]
            },
            tag: {
                type: "text",
                key: "tag",
                value: ""
            },
            persistentPid: {
                type: "text",
                label: "Persistent PID",
                key: "persistentPid",
                value: ""
            },
            descriptionText: {
                type: "text",
                label: "Description text",
                key: "descriptionText",
                value: ""
            }
        };

        $scope.hostUrl = window.location.protocol + "//" + window.location.host + "/user/";

        $scope.initSingleDeposit = function (rootDepositUri, isRoot)
        {
            $scope.rootDepositUri = rootDepositUri;
            $scope.isDepositRoot = isRoot;
        };

        $scope.init = function ()
        {
            $scope.getRegistry(true);
        };

        $scope.getRegistry = function (change)
        {
            const handle = function (data, change)
            {
                $scope.offset = 1;
                //$scope.updateDeposits(data);
                $scope.totalDeposits = 0;

                if (change && data.repositories instanceof Array && data.repositories.length > 0)
                {
                    const repository = data.repositories;
                    $scope.search.repositories = {
                        type: "checkbox",
                        list: true,
                        label: "Repository Used",
                        key: "repositories",
                        change: false,
                        value: []
                    };
                    for (let repo of repository)
                    {
                        $scope.search.repositories.value.push({
                            name: repo.repository,
                            count: repo.count,
                            value: true
                        });
                        $scope.search_settings.totalDeposits += parseInt(repo.count);
                    }
                }
                else if ($scope.search.repositories)
                {
                    for (let repo of $scope.search.repositories.value)
                    {
                        if (repo.value === true)
                        {
                            $scope.search_settings.totalDeposits += parseInt(repo.count);
                        }
                    }
                }
                // $scope.totalDeposits = Math.ceil($scope.totalDeposits / $scope.search_settings.page);
            };

            let url = $scope.get_current_url();
            url += "deposits/search";
            listings.getListing($scope, url, $scope.search_settings.page, $scope.search_settings.offset - 1, $scope.search, change, handle);
        };

        $scope.changePage = function (pageNumber)
        {
            let url = $scope.get_current_url();
            url += "deposits/search";
            listings.getListing($scope, url, $scope.search_settings.page, pageNumber - 1, $scope.search, false, $scope.updateDeposits);
            $scope.search_settings.offset = pageNumber;
        };

        $scope.nextPage = function ()
        {
            let url = $scope.get_current_url();
            url += "deposits/search";
            listings.getListing($scope, url, $scope.search_settings.page, ++$scope.search_settings.offset - 1, $scope.search, false, $scope.updateDeposits);
        };
        $scope.previousPage = function ()
        {
            let url = $scope.get_current_url();
            url += "deposits/search";
            listings.getListing($scope, url, $scope.search_settings.page, --$scope.search_settings.offset - 1, $scope.search, false, $scope.updateDeposits);
        };

        $scope.showPerPage = function (amount)
        {
            $scope.search_settings.page = amount;
            $scope.getRegistry();
        };

        $scope.getDepositConditions = function ()
        {
            depositsService.get_deposit_conditions()
                .then(function (response)
                {
                    $scope.conditionsAccepted = response.conditionsAccepted;
                    $scope.conditionsAccepting = response.conditionsAccepting;
                })
                .catch(function (error)
                {
                    $scope.conditionsAccepted = [];
                    sscope.conditionsAccepting = [];
                });
        };
        $scope.changeUserAccess = function ()
        {
            depositsService.change_user_access()
                .then(function (response)
                {
                })
                .catch(function (error)
                {
                });
        };

        $scope.deposits = [];
    })
    .directive("searchBar", function ()
    {
        return {
            restrict: "ACE",
            scope: true,
            replace: true,
            templateUrl: "/app/views/search/filter_table.ejs",
            link: function (scope, elem, attr)
            {
                scope.attr = function ()
                {
                    return attr.searchmodel;
                };
                scope.update = function (change)
                {
                    if (change === false)
                    {
                        return attr.searchfunction + "(false)";
                    }
                    return attr.searchfunction + "(true)";
                };
            }
        };
    })
    .directive("pageNavigation", function ()
    {
        return {
            restrict: "ACE",
            scope: true,
            replace: true,
            templateUrl: "/app/views/search/dynamic_pagination.ejs",
            link: function (scope, elem, attr)
            {
                scope.max = function ()
                {
                    return attr.maximum;
                };
                scope.change = function (page)
                {
                    return attr.changepage + "(" + page + ")";
                };
                scope.next = function ()
                {
                    return attr.nextpage + "()";
                };
                scope.previous = function ()
                {
                    return attr.previouspage + "()";
                };
                scope.current = function ()
                {
                    return attr.current;
                };
            }
        };
    });
