Player = function Player(socket, name, snake) {
	this.socket = socket;
	this.snake = snake;
	this.name = name;
	this.connected = true;
	Object.defineEvent(this, 'onQuit');
	this.resendAllEntities();

	var $this = this;

	socket.on('playercontrol', function(target) {
		if($this.connected) {
			target = Vector.ify(target);
			if(target)
				$this.snake.target = target;
		}
	});

	socket.on('disconnect', this.disconnect.bind(this));
}
Player.prototype.disconnect = function() {
	if(this.connected) {
		this.onQuit();
		this.connected = false;
		this.snake.destroy()
		this.name = null;
		this.snake = null;
	}
}
Player.listener = function(onJoined) {
	return function(socket) {
		socket.on('join', function(data, callback) {
			var name = data.name.replace(/^\s+|\s+$/, '');
			if(name.length < 3 || name.length > 64) {
				//Name is of a stupid length
				callback(false, true);
			} else if(!(name in players)) {
				snake = new Snake(
					10,
					Color.ify(data.color),
					universe.randomPosition(),
					universe
				);
				snake.name = name;
				snake.target = snake.head.position.clone();
				onJoined.call(new Player(socket, name, snake));

				callback(true);
			} else {
				//Name already taken
				callback(false);
				console.log("Name " + name + " invalid!");
			}
		});
	}
}

Player.prototype.resendAllEntities = function() {
	var p = this;
	universe.entities.forEach(function(e) {
		p.socket.emit('entityadded', {
			p: e.position.toFixed(2),
			r: e.radius,
			c: e.color.toInt(),
			i: e._id
		});
	});
}