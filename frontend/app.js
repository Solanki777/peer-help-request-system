var app = angular.module('peerHelpApp', ['ngRoute']);

var API = 'http://localhost:3000/api';

// ── ROUTING ───────────────────────────────────────────────────────────────────
app.config(function($routeProvider, $locationProvider) {
  $locationProvider.hashPrefix('!');
  $routeProvider
    .when('/login',        { templateUrl: 'views/login.html',     controller: 'AuthCtrl' })
    .when('/register',     { templateUrl: 'views/register.html',  controller: 'AuthCtrl' })
    .when('/dashboard',    { templateUrl: 'views/dashboard.html', controller: 'DashboardCtrl' })
    .when('/request/:id',  { templateUrl: 'views/request.html',   controller: 'RequestCtrl' })
    .when('/profile',      { templateUrl: 'views/profile.html',   controller: 'ProfileCtrl' })
    .otherwise({ redirectTo: '/login' });
});

// ── AUTH SERVICE ──────────────────────────────────────────────────────────────
app.service('AuthService', function() {
  this.saveUser = function(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  };
  this.getToken   = function() { return localStorage.getItem('token'); };
  this.getUser    = function() { return JSON.parse(localStorage.getItem('user') || 'null'); };
  this.isLoggedIn = function() { return !!localStorage.getItem('token'); };
  this.logout     = function() { localStorage.removeItem('token'); localStorage.removeItem('user'); };
});

// ── SOCKET SERVICE ────────────────────────────────────────────────────────────
app.service('SocketService', function() {
  this.socket = io(); // Connect to Socket.IO server
});

// ── NAV CONTROLLER ────────────────────────────────────────────────────────────
app.controller('NavCtrl', function($scope, $location, $http, AuthService, SocketService) {
  $scope.isLoggedIn        = AuthService.isLoggedIn;
  $scope.getUser           = AuthService.getUser;
  $scope.isDarkMode        = localStorage.getItem('darkMode') === 'true';
  $scope.showNotifications = false;
  $scope.notifications     = [];
  $scope.unreadCount       = 0;

  // Apply dark mode on load
  document.documentElement.classList.toggle('dark-mode-html', $scope.isDarkMode);

  $scope.toggleDark = function() {
    $scope.isDarkMode = !$scope.isDarkMode;
    localStorage.setItem('darkMode', $scope.isDarkMode);
  };

  $scope.toggleNotifications = function() {
    $scope.showNotifications = !$scope.showNotifications;
    if ($scope.showNotifications) $scope.loadNotifications();
  };

  $scope.loadNotifications = function() {
    if (!AuthService.isLoggedIn()) return;
    $http.get(API + '/notifications/my', { headers: { Authorization: AuthService.getToken() } })
      .then(function(res) { $scope.notifications = res.data; });
    $http.get(API + '/notifications/unread-count', { headers: { Authorization: AuthService.getToken() } })
      .then(function(res) { $scope.unreadCount = res.data.count; });
  };

  $scope.markAllRead = function() {
    $http.put(API + '/notifications/read-all', {}, { headers: { Authorization: AuthService.getToken() } })
      .then(function() { $scope.unreadCount = 0; $scope.loadNotifications(); });
  };

  // Real-time: listen for notifications via Socket.IO
  var user = AuthService.getUser();
  if (user) {
    SocketService.socket.emit('join', user.id);
    SocketService.socket.on('notification', function(notif) {
      $scope.$apply(function() {
        $scope.notifications.unshift(notif);
        $scope.unreadCount++;
      });
    });
  }

  $scope.logout = function() {
    AuthService.logout();
    $location.path('/login');
  };

  $scope.loadNotifications();
});

// ── AUTH CONTROLLER ───────────────────────────────────────────────────────────
app.controller('AuthCtrl', function($scope, $http, $location, AuthService) {
  if (AuthService.isLoggedIn()) $location.path('/dashboard');
  $scope.user    = {};
  $scope.message = '';
  $scope.loading = false;

  $scope.register = function() {
    $scope.loading = true;
    $http.post(API + '/auth/register', $scope.user)
      .then(function(res) {
        $scope.message = '✅ ' + res.data.message;
        $scope.loading = false;
        $scope.user    = {};
      })
      .catch(function(err) {
        $scope.message = '❌ ' + (err.data ? err.data.message : 'Error');
        $scope.loading = false;
      });
  };

  $scope.login = function() {
    $scope.loading = true;
    $http.post(API + '/auth/login', $scope.user)
      .then(function(res) {
        AuthService.saveUser(res.data.token, res.data.user);
        $location.path('/dashboard');
      })
      .catch(function(err) {
        $scope.message = '❌ ' + (err.data ? err.data.message : 'Login failed');
        $scope.loading = false;
      });
  };
});

// ── DASHBOARD CONTROLLER ──────────────────────────────────────────────────────
app.controller('DashboardCtrl', function($scope, $http, $location, AuthService, SocketService) {
  if (!AuthService.isLoggedIn()) { $location.path('/login'); return; }

  $scope.currentUser    = AuthService.getUser();
  $scope.requests       = [];
  $scope.newRequest     = {};
  $scope.filterSubject  = '';
  $scope.filterAudience = 'All';
  $scope.searchQuery    = '';
  $scope.message        = '';
  $scope.showForm       = false;
  $scope.currentPage    = 1;
  $scope.totalPages     = 1;
  $scope.stats          = {};
  $scope.leaderboard    = [];

  function authHeaders() {
    return { headers: { Authorization: AuthService.getToken() } };
  }

  // ── LOAD STATS ────────────────────────────────────────────────────────────
  $scope.loadStats = function() {
    $http.get(API + '/stats').then(function(res) { $scope.stats = res.data; });
  };

  // ── LOAD LEADERBOARD ──────────────────────────────────────────────────────
  $scope.loadLeaderboard = function() {
    $http.get(API + '/auth/leaderboard').then(function(res) { $scope.leaderboard = res.data; });
  };

  // ── LOAD REQUESTS (with search + pagination) ─────────────────────────────
  $scope.loadRequests = function() {
    var url = API + '/requests?page=' + $scope.currentPage + '&limit=10';
    if ($scope.currentUser.branch) url += '&branch=' + $scope.currentUser.branch;
    if ($scope.filterSubject)      url += '&subject=' + $scope.filterSubject;
    if ($scope.searchQuery)        url += '&search='  + encodeURIComponent($scope.searchQuery);

    $http.get(url).then(function(res) {
      $scope.requests   = res.data.requests;
      $scope.totalPages = res.data.totalPages;
    }).catch(function(err) { console.error(err); });
  };

  // ── SEARCH (called on input) ──────────────────────────────────────────────
  $scope.doSearch = function() {
    $scope.currentPage = 1;
    $scope.loadRequests();
  };

  // ── PAGINATION ────────────────────────────────────────────────────────────
  $scope.getPages = function() {
    var pages = [];
    for (var i = 1; i <= $scope.totalPages; i++) pages.push(i);
    return pages;
  };
  $scope.goToPage = function(p) {
    $scope.currentPage = p;
    $scope.loadRequests();
  };

  // ── CREATE REQUEST ────────────────────────────────────────────────────────
  $scope.createRequest = function() {
    $http.post(API + '/requests', $scope.newRequest, authHeaders())
      .then(function() {
        $scope.message    = '✅ Request posted!';
        $scope.newRequest = {};
        $scope.showForm   = false;
        $scope.loadRequests();
        $scope.loadStats();
      })
      .catch(function(err) {
        $scope.message = '❌ ' + (err.data ? err.data.message : 'Error');
      });
  };

  // ── DELETE REQUEST ────────────────────────────────────────────────────────
  $scope.deleteRequest = function(id) {
    if (!confirm('Delete this request?')) return;
    $http.delete(API + '/requests/' + id, authHeaders())
      .then(function() { $scope.loadRequests(); });
  };

  $scope.viewRequest = function(id) { $location.path('/request/' + id); };

  // ── REAL-TIME: New request from another user ──────────────────────────────
  SocketService.socket.on('newRequest', function(request) {
    $scope.$apply(function() {
      $scope.requests.unshift(request); // Add to top instantly
    });
  });

  // Load everything on startup
  $scope.loadRequests();
  $scope.loadStats();
  $scope.loadLeaderboard();
});

// ── REQUEST DETAIL CONTROLLER ─────────────────────────────────────────────────
app.controller('RequestCtrl', function($scope, $http, $location, $routeParams, AuthService, SocketService) {
  if (!AuthService.isLoggedIn()) { $location.path('/login'); return; }

  $scope.currentUser = AuthService.getUser();
  $scope.request     = {};
  $scope.answers     = [];
  $scope.newAnswer   = { content: '' };
  $scope.message     = '';
  $scope.aiLoading   = false;
  $scope.aiSuggestion = '';

  var requestId = $routeParams.id;

  function authHeaders() {
    return { headers: { Authorization: AuthService.getToken() } };
  }

  $scope.loadRequest = function() {
    $http.get(API + '/requests/' + requestId)
      .then(function(res) { $scope.request = res.data; });
  };

  $scope.loadAnswers = function() {
    $http.get(API + '/answers/' + requestId)
      .then(function(res) { $scope.answers = res.data; });
  };

  $scope.postAnswer = function() {
    $http.post(API + '/answers/' + requestId, $scope.newAnswer, authHeaders())
      .then(function() {
        $scope.newAnswer    = { content: '' };
        $scope.message      = '✅ Answer posted!';
        $scope.aiSuggestion = '';
        $scope.loadAnswers();
      })
      .catch(function(err) {
        $scope.message = '❌ ' + (err.data ? err.data.message : 'Error');
      });
  };

  $scope.vote = function(answerId, type) {
    $http.put(API + '/answers/' + answerId + '/vote', { type: type }, authHeaders())
      .then(function() { $scope.loadAnswers(); });
  };

  $scope.markBest = function(answerId) {
    $http.put(API + '/answers/' + answerId + '/best', {}, authHeaders())
      .then(function() {
        $scope.message = '⭐ Best answer marked!';
        $scope.loadAnswers();
      });
  };

  $scope.deleteAnswer = function(answerId) {
    if (!confirm('Delete your answer?')) return;
    $http.delete(API + '/answers/' + answerId, authHeaders())
      .then(function() {
        $scope.message = '🗑️ Deleted!';
        $scope.loadAnswers();
      });
  };

  // ── AI ANSWER SUGGESTION (uses Anthropic API in artifact) ────────────────
  $scope.getAISuggestion = function() {
    $scope.aiLoading    = true;
    $scope.aiSuggestion = '';

    // We call our own backend which proxies to AI
    $http.post(API + '/answers/ai-suggest', {
      question: $scope.request.title + ' ' + $scope.request.description
    }, authHeaders())
    .then(function(res) {
      $scope.aiSuggestion = res.data.suggestion;
      $scope.aiLoading    = false;
    })
    .catch(function() {
      $scope.aiSuggestion = 'AI suggestion unavailable. Try writing your own answer!';
      $scope.aiLoading    = false;
    });
  };

  // ── REAL-TIME: New answer from another user ───────────────────────────────
  SocketService.socket.on('newAnswer', function(data) {
    if (data.requestId === requestId) {
      $scope.$apply(function() {
        $scope.answers.push(data.answer);
      });
    }
  });

  SocketService.socket.on('voteUpdate', function(data) {
    $scope.$apply(function() {
      $scope.answers.forEach(function(a) {
        if (a._id === data.answerId) a.votes = data.votes;
      });
    });
  });

  $scope.goBack = function() { $location.path('/dashboard'); };
  $scope.loadRequest();
  $scope.loadAnswers();
});

// ── PROFILE CONTROLLER ────────────────────────────────────────────────────────
app.controller('ProfileCtrl', function($scope, $http, $location, AuthService) {
  if (!AuthService.isLoggedIn()) { $location.path('/login'); return; }

  $scope.currentUser    = AuthService.getUser();
  $scope.profileData    = {};
  $scope.myQuestions    = [];
  $scope.myAnswers      = [];

  function authHeaders() {
    return { headers: { Authorization: AuthService.getToken() } };
  }

  $http.get(API + '/auth/profile/' + $scope.currentUser.id)
    .then(function(res) { $scope.profileData = res.data; });

  $http.get(API + '/requests?userId=' + $scope.currentUser.id)
    .then(function(res) { $scope.myQuestions = res.data.requests || []; });

  $scope.goBack = function() { $location.path('/dashboard'); };
});