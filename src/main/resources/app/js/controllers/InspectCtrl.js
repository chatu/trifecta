/**
 * Inspect Controller
 * @author Lawrence Daniels <lawrence.daniels@gmail.com>
 */
(function () {
    angular.module('trifecta')
        .controller('InspectCtrl', ['$scope', '$http', '$log', '$timeout', '$interval', 'ConsumerSvc', 'TopicSvc', 'ZookeeperSvc',
            function ($scope, $http, $log, $timeout, $interval, ConsumerSvc, TopicSvc, ZookeeperSvc) {

                $scope.consumerMapping = [];
                $scope.replicas = [];
                $scope.healthStats = [];

                $scope.formats = ["auto", "binary", "json", "plain-text"];
                $scope.selected = {"format": $scope.formats[0]};
                $scope.zkItem = null;
                $scope.zkItems = [{name: "/ (root)", path: "/", expanded: false}];

                $scope.inspectTabs = [
                    {
                        "name": "Health",
                        "imageURL": "/app/images/tabs/inspect/health-24.png",
                        "active": true,
                        "init": function () {
                            $scope.loadHealthStats()
                        }
                    }, {
                        "name": "Brokers",
                        "imageURL": "/app/images/tabs/inspect/brokers.png",
                        "active": false
                    }, {
                        "name": "Consumers",
                        "imageURL": "/app/images/tabs/inspect/consumers.png",
                        "active": false
                    }, {
                        "name": "Leaders",
                        "imageURL": "/app/images/tabs/inspect/topics.png",
                        "active": false
                    }, {
                        "name": "Replicas",
                        "imageURL": "/app/images/tabs/inspect/replicas-24.png",
                        "active": false
                    }, {
                        "name": "Zookeeper",
                        "imageURL": "/app/images/tabs/inspect/zookeeper.png",
                        "active": false
                    }
                ];

                // select the default tab and make it active
                $scope.inspectTab = $scope.inspectTabs[0];
                $scope.inspectTab.active = true;

                /**
                 * Changes the Inspect sub-tab
                 * @param index the given tab index
                 * @param event the given event
                 */
                $scope.changeInspectTab = function (index, event) {
                    var tab = $scope.inspectTabs[index];
                    $scope.inspectTab = tab;
                    if (event) {
                        event.preventDefault();
                    }

                    // does the tab have an init function?
                    if (tab.init) {
                        $log.info("Executing " + tab.name + "::init()...");
                        tab.init();
                    }
                };

                $scope.expandBroker = function (broker) {
                    broker.expanded = !broker.expanded;
                };

                /**
                 * Expands the consumers for the given topic
                 * @param topic the given topic
                 */
                $scope.expandTopicConsumers = function (topic) {
                    topic.expanded = !topic.expanded;
                    if (topic.expanded) {
                        topic.loadingConsumers = true;
                        ConsumerSvc.getConsumersByTopic(topic.topic).then(
                            function (consumers) {
                                topic.loadingConsumers = false;
                                topic.consumers = consumers;
                            },
                            function (err) {
                                topic.loadingConsumers = false;
                                $scope.addError(err);
                            }
                        );
                    }
                };

                /**
                 * Expands the first Zookeeper item
                 */
                $scope.expandFirstItem = function () {
                    // load the children for the root key
                    if ($scope.zkItems.length) {
                        var firstItem = $scope.zkItems[0];
                        if (firstItem) {
                            $scope.expandItem(firstItem);
                            $scope.getItemInfo(firstItem);
                        }
                    }
                };

                /**
                 * Expands or collapses the given Zookeeper item
                 * @param item the given Zookeeper item
                 */
                $scope.expandItem = function (item) {
                    item.expanded = !item.expanded;
                    if (item.expanded) {
                        item.loading = true;
                        ZookeeperSvc.getZkPath(item.path).then(
                            function (zkItems) {
                                item.loading = false;
                                item.children = zkItems;
                            },
                            function (err) {
                                item.loading = false;
                                errorHandler(err);
                            });
                    }
                };

                $scope.formatData = function (path, format) {
                    ZookeeperSvc.getZkData(path, format).then(
                        function (data) {
                            $scope.zkItem.data = data;
                            if (format == 'auto') {
                                $scope.selected.format = data.type;
                            }
                        },
                        function (err) {
                            errorHandler(err);
                        });
                };

                $scope.getTopicHealthIcon = function (topic) {
                    return (topic.issues)
                        ? "/app/images/common/topic_alert-16.png"
                        : "/app/images/common/topic-16.png";
                };

                $scope.getItemInfo = function (item) {
                    item.loading = true;
                    ZookeeperSvc.getZkInfo(item.path).then(
                        function (itemInfo) {
                            item.loading = false;
                            //$scope.selected.format = $scope.formats[0];
                            $scope.zkItem = itemInfo;
                        },
                        function (err) {
                            item.loading = false;
                            errorHandler(err);
                        });
                };

                $scope.expandReplicas = function (topic) {
                    topic.replicaExpanded = !topic.replicaExpanded;
                    if (topic.replicaExpanded) {
                        topic.loading = true;
                        TopicSvc.getReplicas(topic.topic).then(
                            function (replicas) {
                                $timeout(function () {
                                    topic.loading = false;
                                }, 500);
                                topic.replicas = replicas;

                                angular.forEach(replicas, function (r) {
                                    r.inSyncPct = computeInSyncPct(r);
                                });
                            },
                            function (err) {
                                topic.loading = false;
                                $scope.addError(err);
                            });
                    }
                };

                $scope.loadHealthStats = function () {
                    $http.get('/rest/getHealthStats')
                        .success(function (stats) {
                            $scope.healthStats = stats;
                        })
                };

                $scope.getInSyncClass = function (inSyncPct) {
                    if (inSyncPct == 0) return "in_sync_red";
                    else if (inSyncPct == 100) return "in_sync_green";
                    else return "in_sync_yellow";
                };

                $scope.getInSyncBulbImage = function (inSyncPct) {
                    if (inSyncPct == 0) return "/app/images/status/redlight.png";
                    else if (inSyncPct == 100) return "/app/images/status/greenlight.png";
                    else return "/app/images/status/yellowlight.gif";
                };

                $scope.isConsumerUpToDate = function (consumer) {
                    var details = consumer.details || [];
                    if (!details.length) return false;
                    else {
                        var time = new Date().getTime() - 300000; // 5 minutes ago
                        for (var n = 0; n < details.length; n++) {
                            if (details[n].lastModified >= time) return true;
                        }
                        return false;
                    }
                };

                function computeInSyncPct(replicaPartition) {
                    var replicas = replicaPartition.replicas;
                    var syncCount = 0;
                    for (var n = 0; n < replicas.length; n++) {
                        var replica = replicas[n];
                        if (replica.inSync) syncCount++;
                    }
                    return Math.round(100 * syncCount / replicas.length);
                }

                function errorHandler(err) {
                    $scope.addError(err);
                }

            }])
})();