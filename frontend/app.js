var app = angular.module('peerHelpApp', ['ngRoute']);

var API = 'http://localhost:3000/api';

// ── ROUTING ───────────────────────────────────────────────────────────────────
app.config(function ($routeProvider, $locationProvider, $httpProvider) {
  $locationProvider.hashPrefix('!');
  $routeProvider
    .when('/login', { templateUrl: 'views/login.html', controller: 'AuthCtrl' })
    .when('/register', { templateUrl: 'views/register.html', controller: 'AuthCtrl' })
    .when('/dashboard', { templateUrl: 'views/dashboard.html', controller: 'DashboardCtrl' })
    .when('/request/:id', { templateUrl: 'views/request.html', controller: 'RequestCtrl' })
    .when('/profile', { templateUrl: 'views/profile.html', controller: 'ProfileCtrl', resolve: {
      guard: ['AuthService', '$location', function(AuthService, $location) {
        var u = AuthService.getUser();
        if (u && u.role === 'admin') $location.path('/admin');
      }]
    } })
    .when('/suggestions', { templateUrl: 'views/suggestions.html', controller: 'SuggestionCtrl' })
    .when('/admin', { templateUrl: 'views/admin.html', controller: 'AdminCtrl' })
    .otherwise({ redirectTo: '/login' });

  $httpProvider.interceptors.push('AuthInterceptor');
});

// ── AUTH SERVICE ──────────────────────────────────────────────────────────────
app.service('AuthService', function ($http) {
  this.saveUser = function (token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  };
  this.getToken = function () { return localStorage.getItem('token'); };
  this.getUser = function () { return JSON.parse(localStorage.getItem('user') || 'null'); };
  this.isLoggedIn = function () { return !!localStorage.getItem('token'); };
  this.logout = function () {
    $http.post(API + '/auth/logout', {});
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };
});

// ── AUTH INTERCEPTOR ──────────────────────────────────────────────────────────
app.factory('AuthInterceptor', function ($q, $location) {
  return {
    request: function (config) {
      config.headers = config.headers || {};
      var token = localStorage.getItem('token');
      // Only add to API calls starting with our API base URL
      if (token && config.url.indexOf(API) === 0) {
        config.headers.Authorization = 'Bearer ' + token;
      }
      return config;
    },
    responseError: function (rejection) {
      // If backend returns 401, token might be expired/revoked
      if (rejection.status === 401 && $location.path() !== '/login') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        $location.path('/login');
      }
      return $q.reject(rejection);
    }
  };
});

// ── SOCKET SERVICE ────────────────────────────────────────────────────────────
app.service('SocketService', function () {
  this.socket = io();
});

// ── NAV CONTROLLER ────────────────────────────────────────────────────────────
app.controller('NavCtrl', function ($scope, $location, $http, AuthService, SocketService) {
  $scope.isLoggedIn = AuthService.isLoggedIn;
  $scope.getUser = AuthService.getUser;
  $scope.isDarkMode = localStorage.getItem('darkMode') === 'true';
  $scope.showNotifications = false;
  $scope.notifications = [];
  $scope.unreadCount = 0;

  // Apply dark mode on load — target <body> which is inside Angular's reach
  if ($scope.isDarkMode) document.body.classList.add('dark-mode');

  $scope.toggleDark = function () {
    $scope.isDarkMode = !$scope.isDarkMode;
    localStorage.setItem('darkMode', $scope.isDarkMode);
    document.body.classList.toggle('dark-mode', $scope.isDarkMode);
  };

  $scope.toggleNotifications = function () {
    $scope.showNotifications = !$scope.showNotifications;
    if ($scope.showNotifications) $scope.loadNotifications();
  };

  $scope.loadNotifications = function () {
    if (!AuthService.isLoggedIn()) return;
    $http.get(API + '/notifications/my')
      .then(function (res) { $scope.notifications = res.data; });
    $http.get(API + '/notifications/unread-count')
      .then(function (res) { $scope.unreadCount = res.data.count; });
  };

  $scope.markAllRead = function () {
    $http.put(API + '/notifications/read-all', {})
      .then(function () { $scope.unreadCount = 0; $scope.loadNotifications(); });
  };

  var user = AuthService.getUser();
  if (user) {
    SocketService.socket.emit('join', user.id);
    SocketService.socket.on('notification', function (notif) {
      $scope.$apply(function () {
        $scope.notifications.unshift(notif);
        $scope.unreadCount++;
      });
    });
  }

  $scope.logout = function () {
    AuthService.logout();
    $location.path('/login');
  };

  $scope.loadNotifications();
});

// ── AUTH CONTROLLER ───────────────────────────────────────────────────────────
app.controller('AuthCtrl', function ($scope, $http, $location, AuthService) {
  // On register page, always clear any stale session so
  // "Back to Login" lands on a clean login form
  if ($location.path() === '/register') {
    AuthService.logout();
  }

  // If already logged in (on login page), redirect to correct home
  if (AuthService.isLoggedIn()) {
    var u = AuthService.getUser();
    $location.path(u && u.role === 'admin' ? '/admin' : '/dashboard');
    return;
  }

  $scope.user = {};
  $scope.message = '';
  $scope.loading = false;
  $scope.registered = false;  // shows success screen after register
  $scope.isError = false;
  $scope.isPending = false;

  $scope.register = function () {
    $scope.loading = true;
    $scope.message = '';
    $http.post(API + '/auth/register', $scope.user)
      .then(function () {
        $scope.registered = true;
        $scope.loading = false;
      })
      .catch(function (err) {
        $scope.message = err.data ? err.data.message : 'Registration failed';
        $scope.loading = false;
      });
  };

  // ── Password strength checker ─────────────────────────────────────────────
  $scope.pwStrength = { pct: 0, color: '#e2e8f0', label: '', ok: false };
  $scope.checkPwStrength = function () {
    var pw = $scope.user.password || '';
    var score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    var map = [
      { pct: 0, color: '#e2e8f0', label: '', ok: false },
      { pct: 25, color: '#ef4444', label: '🔴 Very weak', ok: false },
      { pct: 50, color: '#f59e0b', label: '🟠 Weak', ok: false },
      { pct: 75, color: '#3b82f6', label: '🔵 Good', ok: false },
      { pct: 100, color: '#10b981', label: '🟢 Strong', ok: true }
    ];
    $scope.pwStrength = map[score];
  };

  // Sync branch code from department selection
  $scope.syncBranch = function () {
    var map = {
      'Computer Engineering': 'CE',
      'Information Technology': 'IT',
      'Electronics & Communication': 'EC',
      'Mechanical Engineering': 'ME',
      'Civil Engineering': 'CL',
      'Electrical Engineering': 'EE',
      'Chemical Engineering': 'CH'
    };
    if (map[$scope.user.department]) $scope.user.branch = map[$scope.user.department];
  };

  $scope.login = function () {
    $scope.loading = true;
    $scope.message = '';
    $scope.isError = false;
    $scope.isPending = false;
    $http.post(API + '/auth/login', $scope.user)
      .then(function (res) {
        AuthService.saveUser(res.data.token, res.data.user);
        // Redirect admin to admin panel, students to dashboard
        if (res.data.user.role === 'admin') {
          $location.path('/admin');
        } else {
          $location.path('/dashboard');
        }
      })
      .catch(function (err) {
        var msg = err.data ? err.data.message : 'Login failed';
        $scope.message = msg;
        $scope.isPending = msg.indexOf('pending') !== -1;
        $scope.isError = !$scope.isPending;
        $scope.loading = false;
      });
  };
});

// ── DASHBOARD CONTROLLER ──────────────────────────────────────────────────────
app.controller('DashboardCtrl', function ($scope, $http, $location, AuthService, SocketService) {
  if (!AuthService.isLoggedIn()) { $location.path('/login'); return; }

  $scope.currentUser = AuthService.getUser();
  $scope.requests = [];
  $scope.newRequest = {};
  $scope.filterSubject = '';
  $scope.searchQuery = '';
  $scope.message = '';
  $scope.showForm = false;
  $scope.currentPage = 1;
  $scope.totalPages = 1;
  $scope.totalCount = 0;
  $scope.stats = {};
  $scope.leaderboard = [];
  // 'branch' = my branch first (default), 'all' = everything
  $scope.filterView = 'branch';
  // 'newest' | 'most_answered' | 'unanswered'
  $scope.sortBy = 'newest';

  $scope.liveStudents = 0;


  // Listen for live student count updates
  SocketService.socket.on('onlineCount', function (data) {
    $scope.$apply(function () { $scope.liveStudents = data.count; });
  });

  $scope.loadLeaderboard = function () {
    $http.get(API + '/auth/leaderboard').then(function (res) { $scope.leaderboard = res.data; });
  };

  $scope.loadRequests = function () {
    var url = API + '/requests?page=' + $scope.currentPage + '&limit=10';

    // Branch filter: 'branch' mode sends user's branch so backend prioritises it
    if ($scope.filterView === 'branch' && $scope.currentUser.branch) {
      url += '&branch=' + $scope.currentUser.branch;
    }
    // 'all' mode sends no branch — backend returns everything

    if ($scope.filterSubject) url += '&subject=' + $scope.filterSubject;
    if ($scope.searchQuery) url += '&search=' + encodeURIComponent($scope.searchQuery);
    if ($scope.sortBy) url += '&sort=' + $scope.sortBy;

    $http.get(url).then(function (res) {
      $scope.requests = res.data.requests;
      $scope.totalPages = res.data.totalPages;
      $scope.totalCount = res.data.total;
    }).catch(function (err) { console.error(err); });
  };

  $scope.setView = function (view) {
    $scope.filterView = view;
    $scope.currentPage = 1;
    $scope.loadRequests();
  };

  $scope.setSort = function (sort) {
    $scope.sortBy = sort;
    $scope.currentPage = 1;
    $scope.loadRequests();
  };

  $scope.doSearch = function () {
    $scope.currentPage = 1;
    $scope.loadRequests();
  };

  $scope.getPages = function () {
    var pages = [];
    for (var i = 1; i <= $scope.totalPages; i++) pages.push(i);
    return pages;
  };

  $scope.goToPage = function (p) {
    $scope.currentPage = p;
    $scope.loadRequests();
  };

  // ── AUDIENCE HELPERS ─────────────────────────────────────────────────────
  var BRANCHES = ['CE', 'IT', 'EC', 'ME', 'CL'];

  $scope.toggleAllAudience = function () {
    if ($scope.newRequest.audience_all) {
      // Uncheck all specific branches
      BRANCHES.forEach(function (b) { $scope.newRequest['audience_' + b] = false; });
    }
  };

  $scope.getAudienceLabel = function (req) {
    if (!req) return '';
    if (req.audience_all) return 'All Departments';
    var selected = BRANCHES.filter(function (b) { return req['audience_' + b]; });
    return selected.length > 0 ? selected.join(', ') : '';
  };

  function buildAudience(req) {
    if (req.audience_all) return 'General';
    var selected = BRANCHES.filter(function (b) { return req['audience_' + b]; });
    if (selected.length === 0) return 'General';        // nothing checked = show to all
    if (selected.length === BRANCHES.length) return 'General'; // all checked = General
    return selected.join(',');                           // e.g. "CE,IT,ME"
  }

  $scope.createRequest = function () {
    var payload = {
      title: $scope.newRequest.title,
      description: $scope.newRequest.description,
      subject: $scope.newRequest.subject,
      audience: buildAudience($scope.newRequest),
      tags: $scope.newRequest.tags || ''
    };

    $http.post(API + '/requests', payload)
      .then(function () {
        $scope.message = '✅ Request posted!';
        $scope.newRequest = {};
        $scope.showForm = false;
        $scope.loadRequests();
      })
      .catch(function (err) {
        $scope.message = '❌ ' + (err.data ? err.data.message : 'Error');
      });
  };

  $scope.deleteRequest = function (id) {
    if (!confirm('Delete this request?')) return;
    $http.delete(API + '/requests/' + id)
      .then(function () { $scope.loadRequests(); });
  };

  $scope.viewRequest = function (id) { $location.path('/request/' + id); };

  // Real-time: New request from another user (skip own posts — already added by loadRequests)
  SocketService.socket.on('newRequest', function (request) {
    $scope.$apply(function () {
      var isOwn = $scope.currentUser && String(request.userId) === String($scope.currentUser.id);
      var exists = $scope.requests.some(function (r) { return r._id === request._id; });
      if (!isOwn && !exists) {
        $scope.requests.unshift(request);
      }
    });
  });

  $scope.loadRequests();
  $scope.loadLeaderboard();
});

// ── REQUEST DETAIL CONTROLLER ─────────────────────────────────────────────────
app.controller('RequestCtrl', function ($scope, $http, $location, $routeParams, AuthService, SocketService) {
  if (!AuthService.isLoggedIn()) { $location.path('/login'); return; }

  $scope.currentUser = AuthService.getUser();
  $scope.request = {};
  $scope.answers = [];
  $scope.newAnswer = { content: '' };
  $scope.message = '';

  var requestId = $routeParams.id;

  // Helper: safely compare MongoDB ObjectId strings vs JWT id strings
  $scope.isOwner = function (request) {
    return request && $scope.currentUser &&
      String(request.userId) === String($scope.currentUser.id);
  };
  $scope.isAnswerOwner = function (answer) {
    return answer && $scope.currentUser &&
      String(answer.userId) === String($scope.currentUser.id);
  };
  $scope.isCommentOwner = function (comment) {
    return comment && $scope.currentUser &&
      String(comment.userId) === String($scope.currentUser.id);
  };

  // Returns 'up', 'down', or null — shows which way current user voted on this answer
  $scope.getUserVote = function (answer) {
    if (!answer || !answer.votedBy || !$scope.currentUser) return null;
    var vote = answer.votedBy.find(function (v) {
      return String(v.userId) === String($scope.currentUser.id);
    });
    return vote ? vote.vote : null;
  };

 
  $scope.loadRequest = function () {
    $http.get(API + '/requests/' + requestId)
      .then(function (res) { $scope.request = res.data; });
  };

  $scope.loadAnswers = function () {
    $http.get(API + '/answers/' + requestId)
      .then(function (res) {
        $scope.answers = res.data;
        // Pre-load comment counts for all answers so counts show without clicking
        res.data.forEach(function (answer) {
          $http.get(API + '/comments/' + answer._id)
            .then(function (r) { $scope.comments[answer._id] = r.data; });
        });
      });
  };

  $scope.postAnswer = function () {
    $http.post(API + '/answers/' + requestId, { content: $scope.newAnswer.content })
      .then(function () {
        $scope.newAnswer = { content: '' };
        $scope.message = '✅ Answer posted!';
        $scope.loadAnswers();
      })
      .catch(function (err) {
        $scope.message = '❌ ' + (err.data ? err.data.message : 'Error');
      });
  };

  $scope.vote = function (answerId, type) {
    $http.put(API + '/answers/' + answerId + '/vote', { type: type })
      .then(function () { $scope.loadAnswers(); });
  };

  $scope.markBest = function (answerId) {
    $http.put(API + '/answers/' + answerId + '/best', {})
      .then(function () {
        $scope.message = '⭐ Best answer marked!';
        $scope.loadAnswers();
      });
  };

  $scope.deleteAnswer = function (answerId) {
    if (!confirm('Delete your answer?')) return;
    $http.delete(API + '/answers/' + answerId)
      .then(function () {
        $scope.message = '🗑️ Deleted!';
        $scope.loadAnswers();
      });
  };

  // ── COMMENTS (YouTube-style per answer) ──────────────────────────────────
  $scope.comments = {};   // { answerId: [comment, ...] }
  $scope.showComments = {};   // { answerId: true/false }
  $scope.newComment = {};   // { answerId: 'text' }
  $scope.replyTo = {};   // { answerId: commentId|null }
  $scope.replyLabel = {};   // { answerId: '@username' }

  $scope.toggleComments = function (answerId) {
    $scope.showComments[answerId] = !$scope.showComments[answerId];
    if ($scope.showComments[answerId] && !$scope.comments[answerId]) {
      $scope.loadComments(answerId);
    }
  };

  $scope.loadComments = function (answerId) {
    $http.get(API + '/comments/' + answerId)
      .then(function (res) { $scope.comments[answerId] = res.data; });
  };

  $scope.postComment = function (answerId) {
    var text = $scope.newComment[answerId];
    if (!text || !text.trim()) return;
    var payload = { content: text.trim(), parentId: $scope.replyTo[answerId] || null };
    $http.post(API + '/comments/' + answerId, payload)
      .then(function () {
        $scope.newComment[answerId] = '';
        $scope.replyTo[answerId] = null;
        $scope.replyLabel[answerId] = null;
        $scope.loadComments(answerId);
      });
  };

  $scope.setReply = function (answerId, comment) {
    $scope.replyTo[answerId] = comment._id;
    $scope.replyLabel[answerId] = '@' + comment.userName + ' ';
    $scope.newComment[answerId] = '@' + comment.userName + ' ';
  };

  $scope.clearReply = function (answerId) {
    $scope.replyTo[answerId] = null;
    $scope.replyLabel[answerId] = null;
    $scope.newComment[answerId] = '';
  };

  $scope.deleteComment = function (answerId, commentId) {
    if (!confirm('Delete this comment?')) return;
    $http.delete(API + '/comments/' + commentId)
      .then(function () { $scope.loadComments(answerId); });
  };

  // Indent replies visually
  $scope.isReply = function (comment) { return !!comment.parentId; };

  // Real-time: incoming comment from another user
  SocketService.socket.on('newComment', function (data) {
    $scope.$apply(function () {
      if ($scope.showComments[data.answerId]) {
        if (!$scope.comments[data.answerId]) $scope.comments[data.answerId] = [];
        // avoid duplicate if we posted it ourselves
        var exists = $scope.comments[data.answerId].some(function (c) {
          return c._id === data.comment._id;
        });
        if (!exists) $scope.comments[data.answerId].push(data.comment);
      }
    });
  });

  // Real-time
  SocketService.socket.on('newAnswer', function (data) {
    if (data.requestId === requestId) {
      $scope.$apply(function () { $scope.answers.push(data.answer); });
    }
  });

  SocketService.socket.on('voteUpdate', function (data) {
    $scope.$apply(function () {
      $scope.answers.forEach(function (a) {
        if (a._id === data.answerId) a.votes = data.votes;
      });
    });
  });

  $scope.goBack = function () { $location.path('/dashboard'); };
  $scope.loadRequest();
  $scope.loadAnswers();
});

// ── PROFILE CONTROLLER ────────────────────────────────────────────────────────
app.controller('ProfileCtrl', function ($scope, $http, $location, AuthService) {
  if (!AuthService.isLoggedIn()) { $location.path('/login'); return; }

  $scope.currentUser = AuthService.getUser();
  $scope.profileData = {};
  $scope.myQuestions = [];
  $scope.myAnswers = [];
  $scope.activeTab = 'questions';
  $scope.showEdit = false;
  $scope.editData = {};
  $scope.editMessage = '';

  $scope.setTab = function (tab) { $scope.activeTab = tab; };

  $scope.goToQuestion = function (requestId) {
    $location.path('/request/' + requestId);
  };

 
  $scope.saveProfile = function () {
    $scope.editMessage = '';
    $http.put(API + '/auth/profile/' + $scope.currentUser.id, $scope.editData)
      .then(function (res) {
        $scope.editMessage = '✅ Profile updated!';
        $scope.profileData = res.data.user;
        $scope.editData.currentPassword = '';
        $scope.editData.newPassword = '';
        // Update stored user so navbar name updates immediately
        var stored = AuthService.getUser();
        if (res.data.user.name) stored.name = res.data.user.name;
        if (res.data.user.branch) stored.branch = res.data.user.branch;
        localStorage.setItem('user', JSON.stringify(stored));
      })
      .catch(function (err) {
        $scope.editMessage = '❌ ' + (err.data ? err.data.message : 'Error saving');
      });
  };

  // Sync branch code in edit form
  $scope.syncEditBranch = function () {
    var map = {
      'Computer Engineering': 'CE', 'Information Technology': 'IT',
      'Electronics & Communication': 'EC', 'Mechanical Engineering': 'ME',
      'Civil Engineering': 'CL', 'Electrical Engineering': 'EE', 'Chemical Engineering': 'CH'
    };
    if (map[$scope.editData.department]) $scope.editData.branch = map[$scope.editData.department];
  };

  $http.get(API + '/auth/profile/' + $scope.currentUser.id)
    .then(function (res) {
      $scope.profileData = res.data;
      // Pre-fill edit form with all fields
      $scope.editData = {
        name: res.data.name,
        enrollment: res.data.enrollment || '',
        contact: res.data.contact || '',
        dob: res.data.dob ? res.data.dob.split('T')[0] : '',
        department: res.data.department || '',
        branch: res.data.branch || '',
        semester: res.data.semester || '',
        city: res.data.city || '',
        bio: res.data.bio || '',
        interests: res.data.interests || '',
        skills: (res.data.skills || []).join(', ')
      };
    });

  $http.get(API + '/requests?userId=' + $scope.currentUser.id + '&limit=100')
    .then(function (res) { $scope.myQuestions = res.data.requests || []; });

  $http.get(API + '/auth/my-answers/' + $scope.currentUser.id)
    .then(function (res) { $scope.myAnswers = res.data || []; });

  $scope.goBack = function () { $location.path('/dashboard'); };
});

// ── SUGGESTION CONTROLLER ─────────────────────────────────────────────────────
app.controller('SuggestionCtrl', function ($scope, $http, $location, AuthService, SocketService) {
  if (!AuthService.isLoggedIn()) { $location.path('/login'); return; }

  $scope.currentUser = AuthService.getUser();
  $scope.suggestions = [];
  $scope.newSuggestion = {};
  $scope.showForm = false;
  $scope.message = '';
  $scope.loading = false;
  $scope.currentPage = 1;
  $scope.totalPages = 1;

  // Comments state per suggestion
  $scope.comments = {};
  $scope.showComments = {};
  $scope.newComment = {};
  $scope.replyTo = {};
  $scope.replyLabel = {};

 
  // ── POST SUGGESTION — will be pending until admin approves ────────────────
  $scope.postSuggestion = function () {
    $scope.loading = true;
    $http.post(API + '/suggestions', $scope.newSuggestion)
      .then(function (res) {
        $scope.message = res.data.message || '✅ Suggestion submitted for approval!';
        $scope.newSuggestion = {};
        $scope.showForm = false;
        $scope.loading = false;
      })
      .catch(function (err) {
        $scope.message = '❌ ' + (err.data ? err.data.message : 'Error');
        $scope.loading = false;
      });
  };

  // ── DELETE SUGGESTION ─────────────────────────────────────────────────────
  $scope.deleteSuggestion = function (id) {
    if (!confirm('Delete this suggestion?')) return;
    $http.delete(API + '/suggestions/' + id)
      .then(function () { $scope.loadSuggestions(); });
  };

  $scope.isSuggestionOwner = function (s) {
    return s && $scope.currentUser && String(s.userId) === String($scope.currentUser.id);
  };

  // ── COMMENTS ─────────────────────────────────────────────────────────────
  $scope.toggleComments = function (sid) {
    $scope.showComments[sid] = !$scope.showComments[sid];
    if ($scope.showComments[sid]) $scope.loadComments(sid);
  };

  $scope.loadComments = function (sid) {
    $http.get(API + '/suggestions/' + sid + '/comments')
      .then(function (res) { $scope.comments[sid] = res.data; });
  };

  $scope.postComment = function (sid) {
    var text = $scope.newComment[sid];
    if (!text || !text.trim()) return;
    var payload = { content: text.trim(), parentId: $scope.replyTo[sid] || null };
    $http.post(API + '/suggestions/' + sid + '/comments', payload)
      .then(function () {
        $scope.newComment[sid] = '';
        $scope.replyTo[sid] = null;
        $scope.replyLabel[sid] = null;
        $scope.loadComments(sid);
      });
  };

  $scope.setReply = function (sid, c) {
    $scope.replyTo[sid] = c._id;
    $scope.replyLabel[sid] = '@' + c.userName;
    $scope.newComment[sid] = '@' + c.userName + ' ';
  };

  $scope.clearReply = function (sid) {
    $scope.replyTo[sid] = null;
    $scope.replyLabel[sid] = null;
    $scope.newComment[sid] = '';
  };

  $scope.deleteComment = function (sid, cid) {
    if (!confirm('Delete comment?')) return;
    $http.delete(API + '/suggestions/comments/' + cid)
      .then(function () { $scope.loadComments(sid); });
  };

  $scope.isReply = function (c) { return !!c.parentId; };
  $scope.isCommentOwner = function (c) {
    return c && $scope.currentUser && String(c.userId) === String($scope.currentUser.id);
  };

  SocketService.socket.on('newSuggestionComment', function (data) {
    $scope.$apply(function () {
      var sid = data.suggestionId;
      if ($scope.showComments[sid]) {
        if (!$scope.comments[sid]) $scope.comments[sid] = [];
        var exists = $scope.comments[sid].some(function (c) { return c._id === data.comment._id; });
        if (!exists) $scope.comments[sid].push(data.comment);
      }
      $scope.suggestions.forEach(function (s) {
        if (String(s._id) === String(sid)) s.commentCount = (s.commentCount || 0) + 1;
      });
    });
  });

  $scope.goBack = function () { $location.path('/dashboard'); };
  $scope.loadSuggestions();
});

// ── ADMIN CONTROLLER ──────────────────────────────────────────────────────────
app.controller('AdminCtrl', function ($scope, $http, $location, AuthService) {
  // Guard: only admin can access
  var u = AuthService.getUser();
  if (!u || u.role !== 'admin') { $location.path('/dashboard'); return; }

  $scope.currentUser = u;
  $scope.activeTab = 'users';   // users | questions | suggestions | analytics
  $scope.message = '';


  // ── TAB NAVIGATION ──────────────────────────────────────────────────────────
  $scope.setTab = function (tab) {
    $scope.activeTab = tab;
    $scope.message = '';
    if (tab === 'users') $scope.loadUsers();
    if (tab === 'students') $scope.loadStudents();
    if (tab === 'questions') $scope.loadQuestions();
    if (tab === 'suggestions') $scope.loadAdminSuggestions();
    if (tab === 'analytics') $scope.loadAnalytics();
  };

  // ══════════════════════════════════════════════════════════════════════════
  // USERS
  // ══════════════════════════════════════════════════════════════════════════
  $scope.users = [];
  $scope.counts = { pending: 0, approved: 0, rejected: 0, total: 0 };
  $scope.userFilter = { status: 'pending', search: '', branch: '' };
  $scope.editingUser = null;

  $scope.setUserFilter = function (status) {
    $scope.userFilter.status = status;
    $scope.loadUsers();
  };

  $scope.loadUsers = function () {
    var url = API + '/admin/users?status=' + ($scope.userFilter.status || 'all');
    if ($scope.userFilter.search) url += '&search=' + encodeURIComponent($scope.userFilter.search);
    if ($scope.userFilter.branch) url += '&branch=' + $scope.userFilter.branch;
    $http.get(url).then(function (res) {
      $scope.users = res.data.users;
      $scope.counts = res.data.counts;
    });
  };

  $scope.approveUser = function (user) {
    $http.put(API + '/admin/users/' + user._id, { status: 'approved' })
      .then(function () { $scope.message = '✅ ' + user.name + ' approved!'; $scope.loadUsers(); });
  };

  $scope.rejectUser = function (user) {
    if (!confirm('Reject ' + user.name + '?')) return;
    $http.put(API + '/admin/users/' + user._id, { status: 'rejected' })
      .then(function () { $scope.message = '❌ ' + user.name + ' rejected.'; $scope.loadUsers(); });
  };

  $scope.deleteUser = function (user) {
    if (!confirm('Permanently delete ' + user.name + '? This cannot be undone.')) return;
    $http.delete(API + '/admin/users/' + user._id)
      .then(function () { $scope.message = '🗑️ User deleted.'; $scope.loadUsers(); });
  };

  $scope.startEditUser = function (user) {
    $scope.editingUser = {
      _id: user._id,
      name: user.name,
      enrollment: user.enrollment || '',
      contact: user.contact || '',
      dob: user.dob ? user.dob.split('T')[0] : '',
      department: user.department || '',
      branch: user.branch || '',
      semester: user.semester || '',
      city: user.city || '',
      bio: user.bio || '',
      interests: user.interests || '',
      role: user.role,
      status: user.status,
      skills: (user.skills || []).join(', '),
      reputation: user.reputation || 0
    };
  };
  $scope.cancelEdit = function () { $scope.editingUser = null; };

  $scope.saveUser = function () {
    $http.put(API + '/admin/users/' + $scope.editingUser._id, $scope.editingUser)
      .then(function () {
        $scope.message = '✅ User saved!';
        $scope.editingUser = null;
        $scope.loadUsers();
      }).catch(function (err) {
        $scope.message = '❌ ' + (err.data ? err.data.message : 'Error');
      });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // STUDENTS — view & edit all student profiles
  // ══════════════════════════════════════════════════════════════════════════
  $scope.allStudents = [];
  $scope.studentFilter = { search: '', branch: '', semester: '' };
  $scope.editingStudent = null;
  $scope.studentEditMsg = '';

  $scope.loadStudents = function () {
    var url = API + '/admin/users?status=all&role=student';
    if ($scope.studentFilter.search) url += '&search=' + encodeURIComponent($scope.studentFilter.search);
    if ($scope.studentFilter.branch) url += '&branch=' + $scope.studentFilter.branch;
    if ($scope.studentFilter.semester) url += '&semester=' + $scope.studentFilter.semester;
    $http.get(url).then(function (res) {
      // filter out admin accounts, keep only students
      $scope.allStudents = (res.data.users || []).filter(function (u) { return u.role !== 'admin'; });
    });
  };

  $scope.startStudentEdit = function (student) {
    $scope.studentEditMsg = '';
    $scope.editingStudent = {
      _id: student._id,
      name: student.name,
      enrollment: student.enrollment || '',
      contact: student.contact || '',
      dob: student.dob ? student.dob.split('T')[0] : '',
      department: student.department || '',
      branch: student.branch || '',
      semester: student.semester ? String(student.semester) : '',
      city: student.city || '',
      bio: student.bio || '',
      interests: student.interests || '',
      skills: (student.skills || []).join(', '),
      status: student.status,
      reputation: student.reputation || 0
    };
    // Scroll to edit panel
    setTimeout(function () {
      var el = document.querySelector('.border-primary.shadow-sm');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  $scope.cancelStudentEdit = function () {
    $scope.editingStudent = null;
    $scope.studentEditMsg = '';
  };

  $scope.saveStudentEdit = function () {
    $scope.studentEditMsg = '';
    $http.put(API + '/admin/users/' + $scope.editingStudent._id, $scope.editingStudent)
      .then(function () {
        $scope.studentEditMsg = '✅ Profile saved successfully!';
        $scope.loadStudents();
        // Auto close after 2 seconds
        setTimeout(function () { $scope.$apply(function () { $scope.editingStudent = null; $scope.studentEditMsg = ''; }); }, 2000);
      }).catch(function (err) {
        $scope.studentEditMsg = '❌ ' + (err.data ? err.data.message : 'Error saving');
      });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTIONS / ANSWERS
  // ══════════════════════════════════════════════════════════════════════════
  $scope.questions = [];
  $scope.qPage = 1;
  $scope.qTotalPages = 1;
  $scope.qFilter = { search: '', subject: '', status: 'pending', hidden: '' };
  $scope.expandedPreview = {};
  $scope.qAnswers = {};

  $scope.loadQuestions = function () {
    var url = API + '/admin/questions?page=' + $scope.qPage + '&limit=15';
    if ($scope.qFilter.search) url += '&search=' + encodeURIComponent($scope.qFilter.search);
    if ($scope.qFilter.subject) url += '&subject=' + $scope.qFilter.subject;
    if ($scope.qFilter.status) url += '&status=' + $scope.qFilter.status;
    if ($scope.qFilter.hidden !== '') url += '&hidden=' + $scope.qFilter.hidden;
    $http.get(url).then(function (res) {
      $scope.questions = res.data.questions;
      $scope.qTotalPages = res.data.totalPages;
      $scope.qPendingCount = res.data.pendingCount || 0;
    });
  };

  $scope.approveQuestion = function (q) {
    $http.put(API + '/admin/questions/' + q._id + '/approve', {})
      .then(function () { $scope.message = '✅ Question approved!'; $scope.loadQuestions(); });
  };

  $scope.rejectQuestion = function (q) {
    if (!confirm('Reject this question?')) return;
    $http.put(API + '/admin/questions/' + q._id + '/reject', {})
      .then(function () { $scope.message = '❌ Question rejected.'; $scope.loadQuestions(); });
  };

  $scope.toggleHideQ = function (q) {
    $http.put(API + '/admin/questions/' + q._id + '/hide', { hide: !q.isHidden })
      .then(function () { q.isHidden = !q.isHidden; $scope.message = q.isHidden ? '🙈 Question hidden' : '👁️ Question visible'; });
  };

  $scope.deleteQ = function (q) {
    if (!confirm('Permanently delete this question?')) return;
    $http.delete(API + '/admin/questions/' + q._id)
      .then(function () { $scope.message = '🗑️ Deleted'; $scope.loadQuestions(); });
  };

  $scope.expandQ = function (q) {
    $scope.expandedQ = ($scope.expandedQ === q._id) ? null : q._id;
    if ($scope.expandedQ && !$scope.qAnswers[q._id]) {
      $http.get(API + '/admin/questions/' + q._id + '/answers')
        .then(function (res) { $scope.qAnswers[q._id] = res.data; });
    }
  };

  $scope.toggleHideA = function (qId, a) {
    $http.put(API + '/admin/answers/' + a._id + '/hide', { hide: !a.isHidden })
      .then(function () { a.isHidden = !a.isHidden; });
  };

  $scope.deleteA = function (qId, a) {
    if (!confirm('Delete this answer?')) return;
    $http.delete(API + '/admin/answers/' + a._id)
      .then(function () {
        $scope.qAnswers[qId] = $scope.qAnswers[qId].filter(function (x) { return x._id !== a._id; });
      });
  };

  $scope.qGetPages = function () { var p = []; for (var i = 1; i <= $scope.qTotalPages; i++) p.push(i); return p; };
  $scope.qGoToPage = function (p) { $scope.qPage = p; $scope.loadQuestions(); };

  // ══════════════════════════════════════════════════════════════════════════
  // SUGGESTIONS
  // ══════════════════════════════════════════════════════════════════════════
  $scope.adminSuggestions = [];
  $scope.sPage = 1;
  $scope.sTotalPages = 1;
  $scope.sFilter = { status: 'pending', search: '' };
  $scope.statusNote = {};   // { id: note text }

  $scope.loadAdminSuggestions = function () {
    var url = API + '/admin/suggestions?page=' + $scope.sPage + '&limit=15';
    if ($scope.sFilter.status) url += '&status=' + $scope.sFilter.status;
    if ($scope.sFilter.search) url += '&search=' + encodeURIComponent($scope.sFilter.search);
    $http.get(url).then(function (res) {
      $scope.adminSuggestions = res.data.suggestions;
      $scope.sTotalPages = res.data.totalPages;
      $scope.sPendingCount = res.data.pendingCount || 0;
    });
  };

  $scope.approveSuggestion = function (s) {
    $http.put(API + '/admin/suggestions/' + s._id + '/approve', {})
      .then(function () { $scope.message = '✅ Suggestion approved!'; $scope.loadAdminSuggestions(); });
  };

  $scope.rejectSuggestion = function (s) {
    var note = $scope.statusNote[s._id] || '';
    if (!confirm('Reject this suggestion?')) return;
    $http.put(API + '/admin/suggestions/' + s._id + '/reject', { adminNote: note })
      .then(function () { $scope.message = '❌ Suggestion rejected.'; $scope.loadAdminSuggestions(); });
  };

  $scope.setSuggestionStatus = function (s, status) {
    var note = $scope.statusNote[s._id] || '';
    $http.put(API + '/admin/suggestions/' + s._id + '/status', { status: status, adminNote: note })
      .then(function (res) {
        s.status = res.data.suggestion.status;
        s.adminNote = res.data.suggestion.adminNote;
        $scope.message = '✅ Status set to ' + status;
      });
  };

  $scope.sGetPages = function () { var p = []; for (var i = 1; i <= $scope.sTotalPages; i++) p.push(i); return p; };
  $scope.sGoToPage = function (p) { $scope.sPage = p; $scope.loadAdminSuggestions(); };

  var STATUS_COLORS = { Open: 'secondary', Accepted: 'success', 'In Progress': 'primary', Rejected: 'danger' };
  $scope.statusColor = function (s) { return STATUS_COLORS[s] || 'secondary'; };

  var CAT_ICONS = { Feature: '✨', Bug: '🐛', Content: '📚', UI: '🎨', Other: '💬' };
  $scope.catIcon = function (c) { return CAT_ICONS[c] || '💬'; };

  // ══════════════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════════════════════════
  $scope.analytics = null;

  $scope.loadAnalytics = function () {
    $http.get(API + '/admin/analytics').then(function (res) { $scope.analytics = res.data; });
  };

  // ── INIT ───────────────────────────────────────────────────────────────────
  $scope.loadUsers();   // start on users tab
});