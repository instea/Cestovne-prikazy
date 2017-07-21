node {
    stage 'Checkout'
    checkout scm
    
    stage 'Build'
    sh 'sh bin/build.sh'
    sh 'cp bin/deploy.sh /opt/cestaky/bin'
    dir('/opt/cestaky/src') {
        sh 'rm -rf server build public node_modules'
    }
    sh 'cp -t /opt/cestaky/src server build public node_modules'
    
    stage 'Deploy'
    dir('/opt/cestaky/src') {
        sh 'sh /opt/cestaky/bin/deploy.sh'
    }
}
